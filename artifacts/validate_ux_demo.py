"""LifeGuard 新手 UX 走查 + 竞赛演示验收。全程模拟第一次接触产品的用户，不依赖说明书。"""
from pathlib import Path
import json
import sys
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:5173"
OUT = Path(__file__).parent
TODAY = date.today()
errors = []
warnings = []
checks = []
findings = []


def ok(name):
    checks.append(name)
    print(f"PASS {name}", flush=True)


def note(name):
    findings.append(name)
    print(f"NOTE {name}", flush=True)


def attach(page):
    def on_console(msg):
        if msg.text.startswith("Warning: Parameter not found:"):
            warnings.append(f"OCR engine: {msg.text}")
        elif msg.type == "error":
            errors.append(f"console: {msg.text}")
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    page.on("console", on_console)


def goto(page, path):
    page.goto(f"{BASE}{path}", wait_until="networkidle")
    page.wait_for_selector("main")


def state(page):
    return page.evaluate("""() => {
      const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
      if (raw) return JSON.parse(raw)
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
      return pinia ? JSON.parse(JSON.stringify(pinia.state.value.demo)) : null
    }""")


def wait_state(page, expr, timeout=30000):
    page.wait_for_function(
        f"() => {{ const s = JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1')); return {expr} }}",
        timeout=timeout,
    )


def stat(page, label):
    return page.locator(".card").filter(has_text=label).locator("p.numeric").first.inner_text().strip()


def iso(offset):
    return (TODAY + timedelta(days=offset)).isoformat()


def shot(page, name):
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_function("window.scrollY === 0")
    page.screenshot(path=OUT / name, full_page=True)


def no_overflow(page, name):
    width = page.evaluate("document.documentElement.scrollWidth")
    viewport = page.evaluate("innerWidth")
    assert width <= viewport + 1, f"{name}: 横向溢出 {width}>{viewport}"


def nav(page, label):
    paths = {"今日概览": "/dashboard", "材料中心": "/materials", "期限雷达": "/radar", "行动中心": "/actions", "消费分析": "/spending", "隐私与设置": "/settings"}
    page.locator("nav[aria-label='主导航']").get_by_text(label, exact=True).click()
    page.wait_for_url(f"**{paths[label]}")
    page.wait_for_load_state("networkidle")
    page.wait_for_selector("main")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    attach(page)

    # U1 第一次打开：欢迎页是否自解释、英雄卡是否实时
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_selector("main")
    hero = page.locator("main section").first
    assert str(TODAY.year) in hero.inner_text() and "年" in hero.inner_text()
    assert "2026 年 11 月 5 日" not in page.content(), "欢迎页仍残留硬编码日期"
    snapshot = state(page)
    headphones = next(m for m in snapshot["matters"] if m["id"] == "matter-headphones")
    assert headphones["title"] in hero.inner_text()
    assert "演示工作区 · 实时计算" in hero.inner_text()
    urgent = len([m for m in snapshot["matters"] if m["status"] == "active" and m["dueDate"] and 0 <= (date.fromisoformat(m["dueDate"]) - TODAY).days <= 2])
    assert f"今天，先处理这 {urgent} 件事" in hero.inner_text()
    demo_section = page.locator("#demo")
    for label in ["模拟数据 1", "模拟数据 2", "模拟数据 3"]:
        assert demo_section.get_by_text(label, exact=True).is_visible()
    assert demo_section.get_by_text("不是预设答案", exact=False).is_visible()
    assert demo_section.get_by_role("button", name="一键加载演示案例", exact=True).is_visible()
    assert page.get_by_role("link", name="免登录体验完整演示", exact=False).is_visible()
    shot(page, "ux-welcome-desktop.png")
    ok("U1 欢迎页自解释：实时日期与待办数量、三组模拟数据标记、一键加载入口，无需说明书")

    # U2 一键加载竞赛演示
    demo_section.get_by_role("button", name="一键加载演示案例", exact=True).click()
    page.wait_for_url("**/dashboard")
    assert page.get_by_text("竞赛演示已加载", exact=True).is_visible()
    assert page.locator("[aria-live='polite']").count() >= 1
    snapshot = state(page)
    active = [m for m in snapshot["matters"] if m["status"] == "active"]
    assert stat(page, "待处理事项") == str(len(active))
    assert all(m["assessment"]["score"] > 0 for m in active), "演示事项必须有实时计算的评分"
    assert all(m["assessment"]["ruleVersion"] for m in active)
    plans = {a["matterId"]: a for a in snapshot["actions"]}
    assert all(plans[m["id"]]["generationMode"] == "rule" and plans[m["id"]]["ruleVersion"] for m in active)
    assert all(any(s["key"] == "verify-facts" for s in plans[m["id"]]["steps"]) for m in active)
    assert page.locator("nav[aria-label='主导航']").get_by_text("材料中心", exact=True).is_visible()
    shot(page, "ux-demo-dashboard-desktop.png")
    ok("U2 一键加载：三组案例进入工作区，评分与行动方案均由规则引擎实时生成（含规则版本与核实步骤）")

    # U3 案例一：新手从材料中心确认字段 → 风险 → 行动 → 完成
    nav(page, "材料中心")
    assert page.get_by_text("预置识别样例", exact=True).is_visible()
    assert page.get_by_text("键盘订单截图.png", exact=True).first.is_visible()
    assert page.locator("#material-fields-form label").filter(has_text="退货截止日").get_by_text("待确认", exact=True).is_visible()
    assert page.get_by_text("材料未包含明确期限，请人工确认", exact=False).is_visible()
    assert page.get_by_role("button", name="确认字段并生成事项", exact=True).is_enabled()
    shot(page, "ux-demo-case1-material-desktop.png")
    page.get_by_role("button", name="确认字段并生成事项", exact=True).click()
    page.wait_for_url("**/matters/*")
    wait_state(page, "s.matters.some((m) => m.title === '机械键盘退货' && m.source === 'material')")
    keyboard = next(m for m in state(page)["matters"] if m["title"] == "机械键盘退货")
    assert keyboard["dueDate"] == iso(4)
    assert page.get_by_role("heading", name="机械键盘退货", exact=True).is_visible()
    assessment = page.locator("section[aria-labelledby='assessment-title']")
    assert assessment.is_visible()
    assert assessment.locator("article").count() == 5
    assert assessment.get_by_text("为什么是这个优先级", exact=True).is_visible()
    assert assessment.get_by_text("规则版本", exact=False).is_visible()
    plan = page.locator("section[aria-labelledby='detail-plan-title']")
    assert plan.get_by_text("动态规则方案", exact=True).is_visible()
    assert plan.get_by_text("当前情况分析", exact=True).is_visible()
    assert plan.get_by_text("主要风险", exact=True).is_visible()
    assert plan.locator("label").count() >= 3
    assert page.get_by_text("信息来源与确认", exact=True).is_visible()
    assert page.get_by_text("建议准备的材料", exact=True).is_visible()
    assert page.get_by_text("规则核实边界", exact=True).is_visible()
    progress_before = plan.locator("span.numeric").first.inner_text()
    plan.locator("label").first.click()
    assert plan.locator("label").first.locator("input[type='checkbox']").is_checked()
    assert plan.locator("span.numeric").first.inner_text() != progress_before
    shot(page, "ux-demo-case1-matter-desktop.png")
    page.get_by_role("button", name="标记完成", exact=True).click()
    complete = page.get_by_role("dialog", name="记录实际处理结果")
    complete.get_by_label("处理结果", exact=True).fill("已提交退货申请并保存受理编号")
    complete.get_by_label("确认少支出或挽回金额（可选）", exact=True).fill("499")
    complete.get_by_role("button", name="保存完成记录", exact=True).click()
    wait_state(page, f"s.matters.find((m) => m.id === '{keyboard['id']}').status === 'completed'")
    assert page.get_by_text("已提交退货申请并保存受理编号", exact=True).is_visible()
    assert page.get_by_role("heading", name="处理结果", exact=True).is_visible()
    assert page.locator("section[aria-labelledby='history-title']").get_by_text("事项已完成", exact=True).is_visible()
    nav(page, "今日概览")
    assert stat(page, "待处理事项") == str(len(active))
    ok("U3 案例一闭环：待确认字段→确认生成事项→五维评分与原因→勾选步骤→记录完成结果，统计同步")

    # U4 案例二：保修事项与证据链
    goto(page, "/matters/matter-tablet")
    assert page.get_by_text("虚构演示样例", exact=True).is_visible()
    assert page.locator("section[aria-labelledby='assessment-title'] article").count() == 5
    evidence = page.locator("section").filter(has_text="来源与证据").first
    assert evidence.locator("a[href='/materials?material=material-invoice']").is_visible()
    assert page.get_by_text("这是虚构演示事项", exact=False).count() == 0
    provenance = page.locator("section").filter(has_text="信息来源与确认").first
    assert provenance.get_by_text("已核对", exact=True).count() >= 1
    assert page.locator("section[aria-labelledby='detail-plan-title']").get_by_text("备份", exact=False).first.is_visible()
    shot(page, "ux-demo-case2-desktop.png")
    ok("U4 案例二：保修事项展示五维评分、已核对来源与电子发票证据链，明确标注虚构演示")

    # U5 案例三：订阅续费提醒、预测图表、重复候选、暂停与恢复
    nav(page, "期限雷达")
    reminders = page.locator("section[aria-label='订阅续费提醒']")
    assert reminders.is_visible()
    assert reminders.get_by_text("灵感笔记 Pro", exact=True).is_visible()
    assert reminders.locator("a[href='/subscriptions/sub-video']").count() == 0, "已关联事项的续费不应重复提醒"
    assert page.locator("a[href='/matters/matter-video']").is_visible()
    shot(page, "ux-demo-radar-desktop.png")
    nav(page, "消费分析")
    summary = page.locator("section[aria-label='订阅支出摘要']")
    monthly_before = summary.locator(".card").nth(0).locator("p.numeric").inner_text()
    annual_before = summary.locator(".card").nth(2).locator("p.numeric").inner_text()
    assert summary.locator(".card").nth(3).locator("p.numeric").inner_text().strip() == "1"
    canvases = page.locator("canvas")
    assert canvases.count() >= 2, "趋势图与构成图应真实渲染"
    for index in range(canvases.count()):
        box = canvases.nth(index).bounding_box()
        assert box and box["width"] > 100 and box["height"] > 80, f"图表 {index} 尺寸异常"
    assert page.locator("section[aria-labelledby='renewal-timeline-title'] li").count() >= 1
    duplicate = page.locator("section[aria-labelledby='duplicate-title']")
    assert duplicate.get_by_text("候选，非结论", exact=True).is_visible()
    assert duplicate.get_by_text("分类相同不代表权益相同", exact=False).is_visible()
    assert page.locator("section[aria-labelledby='suggestions-title']").get_by_text("不预判浪费", exact=False).is_visible()
    assert page.locator("section[aria-labelledby='subscription-list-title']").get_by_text("不代表第三方服务已取消", exact=False).is_visible()
    shot(page, "ux-demo-spending-desktop.png")
    page.locator("section[aria-labelledby='subscription-list-title']").get_by_role("button", name="暂停跟踪", exact=True).first.click()
    wait_state(page, "s.subscriptions.some((x) => x.status === 'paused')")
    monthly_paused = summary.locator(".card").nth(0).locator("p.numeric").inner_text()
    assert monthly_paused != monthly_before
    nav(page, "今日概览")
    assert stat(page, "每月周期支出") == monthly_paused.strip()
    nav(page, "消费分析")
    page.locator("label").filter(has_text="筛选订阅状态").locator("select").select_option("paused")
    page.get_by_role("button", name="恢复跟踪", exact=True).first.click()
    wait_state(page, "!s.subscriptions.some((x) => x.status === 'paused')")
    page.locator("label").filter(has_text="筛选订阅状态").locator("select").select_option("active")
    assert summary.locator(".card").nth(0).locator("p.numeric").inner_text() == monthly_before
    assert summary.locator(".card").nth(2).locator("p.numeric").inner_text() == annual_before
    ok("U5 案例三：续费提醒去重、图表真实渲染、重复候选只给依据、暂停/恢复后全站统计回到原值")

    # U6 一键加载必须保护用户已有记录
    goto(page, "/dashboard")
    matter_count_before = len(state(page)["matters"])
    page.get_by_role("button", name="新建事项", exact=True).first.click()
    dialog = page.get_by_role("dialog", name="新建生活事项")
    dialog.locator("#matter-title").fill("用户自己的记录")
    dialog.locator("#matter-merchant").fill("虚构机构")
    dialog.locator("#matter-action").fill("核对后办理")
    dialog.get_by_role("button", name="创建并生成行动清单", exact=True).click()
    page.wait_for_url("**/matters/*")
    wait_state(page, "s.matters.some((m) => m.title === '用户自己的记录')")
    page.goto(BASE + "/", wait_until="networkidle")
    page.locator("#demo").get_by_role("button", name="一键加载演示案例", exact=True).click()
    protect = page.get_by_role("dialog", name="加载竞赛演示案例？")
    assert protect.is_visible()
    assert protect.get_by_text("此操作无法撤销", exact=False).is_visible()
    protect.get_by_role("button", name="取消", exact=True).click()
    assert len(state(page)["matters"]) == matter_count_before + 1
    page.locator("#demo").get_by_role("button", name="一键加载演示案例", exact=True).click()
    page.get_by_role("dialog", name="加载竞赛演示案例？").get_by_role("button", name="替换并加载", exact=True).click()
    page.wait_for_url("**/dashboard")
    wait_state(page, "!s.matters.some((m) => m.title === '用户自己的记录')")
    ok("U6 一键加载保护：存在用户记录时先确认，取消保留数据，确认后才替换为演示案例")

    # U7 上传过程的加载反馈
    goto(page, "/materials")
    page.get_by_role("button", name="上传材料", exact=True).first.click()
    upload_dialog = page.get_by_role("dialog", name="上传生活材料")
    assert upload_dialog.get_by_text("不会上传到服务器", exact=False).is_visible()
    upload_dialog.locator("input[type='file']").set_input_files(str(OUT / "acceptance-order-clear.png"))
    page.get_by_role("button", name="添加并确认材料", exact=True).click()
    page.wait_for_url("**/materials?material=*")
    progress_region = page.locator("[aria-live='polite']").first
    progress_region.wait_for(state="visible", timeout=15000)
    assert "%" in progress_region.inner_text()
    assert progress_region.locator("div[style*='width']").count() >= 1
    shot(page, "ux-upload-progress-desktop.png")
    page.wait_for_function("""() => {
      const id = new URLSearchParams(location.search).get('material')
      const s = JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1'))
      const m = s.materials.find((item) => item.id === id)
      return m && m.status !== 'processing'
    }""", timeout=240000)
    assert page.get_by_role("button", name="确认字段并生成事项", exact=True).is_enabled()
    page.get_by_role("button", name="删除材料与记录", exact=True).click()
    page.get_by_role("button", name="确认删除", exact=True).click()
    ok("U7 加载与反馈：上传后显示阶段文案、百分比进度条与 aria-live，完成后确认按钮可用")

    # U8 键盘可达性与视觉基础
    goto(page, "/dashboard")
    page.keyboard.press("Tab")
    focused = page.evaluate("document.activeElement.textContent || document.activeElement.getAttribute('aria-label')")
    assert "跳到主要内容" in focused
    outline = page.evaluate("getComputedStyle(document.activeElement).outlineWidth")
    assert outline != "0px", f"键盘焦点缺少可见描边：{outline}"
    page.keyboard.press("Enter")
    assert page.evaluate("document.activeElement.id") == "main-content" or page.url.endswith("#main-content")
    page.keyboard.press("Control+k")
    search_dialog = page.get_by_role("dialog", name="搜索工作区")
    search_dialog.wait_for(state="visible")
    search_dialog.get_by_placeholder("输入名称、商家或类别…").fill("保修")
    assert search_dialog.locator("a[href^='/matters/']").count() >= 1
    page.keyboard.press("Escape")
    search_dialog.wait_for(state="detached")
    assert page.get_by_role("dialog").count() == 0
    ok("U8 键盘可达：跳转主内容链接、可见焦点描边、⌘K 搜索实时命中与 Esc 关闭")

    # U9 移动端走查
    mobile = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    mpage = mobile.new_page()
    attach(mpage)
    mpage.goto(BASE + "/", wait_until="networkidle")
    no_overflow(mpage, "mobile welcome")
    assert mpage.locator("#demo").get_by_role("button", name="一键加载演示案例", exact=True).is_visible()
    shot(mpage, "ux-welcome-mobile.png")
    mpage.locator("#demo").get_by_role("button", name="一键加载演示案例", exact=True).click()
    mpage.wait_for_url("**/dashboard")
    for path in ["/dashboard", "/materials", "/radar", "/actions", "/spending", "/settings", "/matters/matter-headphones", "/subscriptions/sub-notes"]:
        goto(mpage, path)
        no_overflow(mpage, f"mobile {path}")
    goto(mpage, "/dashboard")
    mpage.get_by_role("button", name="打开导航", exact=True).click()
    assert mpage.locator("nav[aria-label='主导航']").is_visible()
    mpage.locator("nav[aria-label='主导航']").get_by_text("消费分析", exact=True).click()
    mpage.wait_for_url("**/spending")
    assert mpage.locator("div.fixed.inset-0.z-40").count() == 0, "点击导航后抽屉遮罩应关闭"
    shot(mpage, "ux-demo-spending-mobile.png")
    goto(mpage, "/radar")
    shot(mpage, "ux-demo-radar-mobile.png")
    goto(mpage, "/matters/matter-headphones")
    shot(mpage, "ux-demo-case1-mobile.png")
    assert mpage.get_by_role("button", name="标记完成", exact=True).is_visible()
    mobile.close()
    ok("U9 移动端：欢迎页与全部业务路由无横向溢出，抽屉导航可用，关键操作按钮可见")

    context.close()
    browser.close()

print(json.dumps({"checks": len(checks), "findings": findings, "errors": errors, "ocr_engine_warnings": sorted(set(warnings))}, ensure_ascii=False, indent=2), flush=True)
if errors:
    raise SystemExit(1)