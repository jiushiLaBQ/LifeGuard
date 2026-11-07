from pathlib import Path
import json
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
OUT = Path(__file__).parent
errors = []
warnings = []
checks = []


def ok(name):
    checks.append(name)
    print(f"PASS {name}", flush=True)


def attach(page):
    def on_console(msg):
        if msg.text.startswith("Warning: Parameter not found:"):
            warnings.append(f"OCR engine: {msg.text}")
        elif msg.type == "error":
            errors.append(f"console: {msg.text}")
        elif msg.type == "warning":
            warnings.append(msg.text)
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    page.on("console", on_console)


def goto(page, path):
    page.goto(f"{BASE}{path}", wait_until="networkidle")
    page.wait_for_selector("main")


def state(page):
    return page.evaluate("JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1'))")


def wait_state(page, expr):
    page.wait_for_function(f"() => {{ const s = JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1')); return {expr} }}", timeout=30000)


def stat(page, label):
    return page.locator(".card").filter(has_text=label).locator("p.numeric").first.inner_text().strip()


def future(days):
    return page.evaluate(f"""() => {{
      const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + {days});
      return `${{d.getFullYear()}}-${{String(d.getMonth() + 1).padStart(2, '0')}}-${{String(d.getDate()).padStart(2, '0')}}`;
    }}""")


def no_overflow(page, name):
    width = page.evaluate("document.documentElement.scrollWidth")
    viewport = page.evaluate("innerWidth")
    assert width <= viewport + 1, f"{name}: horizontal overflow {width}>{viewport}"
    ok(f"{name} no horizontal overflow")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
    context.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    page = context.new_page()
    attach(page)

    goto(page, "/settings")
    page.get_by_role("button", name="清空记录", exact=True).click()
    page.get_by_placeholder("清空", exact=True).fill("清空")
    page.get_by_role("button", name="永久清空", exact=True).click()
    wait_state(page, "s.matters.length === 0 && s.subscriptions.length === 0")
    goto(page, "/dashboard")
    assert stat(page, "待处理事项") == "0"
    assert "0" in stat(page, "每月周期支出")
    ok("baseline empty workspace with zeroed dashboard stats")

    # Chain 1: material upload -> recognition -> confirmation -> matter -> radar -> dashboard
    image_path = OUT / "validation-pixel.png"
    due_soon = future(5)
    goto(page, "/materials")
    page.get_by_role("button", name="上传材料", exact=True).first.click()
    page.get_by_role("dialog", name="上传生活材料").locator("input[type='file']").set_input_files(str(image_path))
    page.get_by_role("button", name="添加并确认材料", exact=True).click()
    page.wait_for_url("**/materials?material=*")
    page.wait_for_function("""() => {
      const id = new URLSearchParams(location.search).get('material')
      const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
      if (!id || !raw) return false
      const material = JSON.parse(raw).materials.find((item) => item.id === id)
      const button = document.querySelector('button[form="material-fields-form"]')
      return material && ['awaiting_confirmation', 'ready', 'error'].includes(material.status) && button && !button.disabled
    }""", timeout=240000)
    form = page.locator("#material-fields-form")
    form.locator("label").filter(has_text="事项名称").locator("input").fill("集成验收订单")
    form.locator("label").filter(has_text="商家 / 机构").locator("input").fill("虚构商家")
    form.locator("label").filter(has_text="金额").locator("input").fill("120")
    form.locator("label").filter(has_text="到期 / 退货截止日期").locator("input").fill(due_soon)
    page.locator("label").filter(has_text="货币单位").locator("select").select_option("CNY")
    page.get_by_role("button", name="确认字段并生成事项", exact=True).click()
    page.wait_for_url("**/matters/*")
    wait_state(page, "s.matters.some((m) => m.title === '集成验收订单' && m.source === 'material' && m.assessment)")
    matter = next(m for m in state(page)["matters"] if m["title"] == "集成验收订单")
    matter_id = matter["id"]
    assert state(page)["actions"] and any(a["matterId"] == matter_id for a in state(page)["actions"])
    goto(page, "/radar")
    assert page.locator(f"a[href='/matters/{matter_id}']").is_visible()
    goto(page, "/dashboard")
    assert stat(page, "待处理事项") == "1"
    assert stat(page, "7 天内到期") == "1"
    ok("chain 1: material confirmation creates matter, plan, radar entry and dashboard stats")

    # Chain 2: matter -> score -> reasons -> plan steps -> materials -> completion
    goto(page, f"/matters/{matter_id}")
    assert page.locator("section[aria-labelledby='assessment-title']").is_visible()
    assert page.locator("section[aria-labelledby='assessment-title'] article").count() >= 4
    plan_section = page.locator("section[aria-labelledby='detail-plan-title']")
    assert plan_section.is_visible()
    assert plan_section.locator("label").count() >= 3
    step = plan_section.locator("label").first
    step.click()
    assert step.locator("input[type='checkbox']").is_checked()
    assert page.get_by_text("建议准备的材料", exact=True).is_visible()
    assert page.locator("section").filter(has_text="建议准备的材料").locator("li").count() >= 1
    score_before_complete = matter["assessment"]["score"]
    page.get_by_role("button", name="标记完成", exact=True).click()
    page.get_by_label("处理结果", exact=True).fill("集成链路验收完成")
    page.get_by_label("确认少支出或挽回金额（可选）", exact=True).fill("20")
    page.get_by_role("button", name="保存完成记录", exact=True).click()
    wait_state(page, f"s.matters.find((m) => m.id === '{matter_id}').status === 'completed'")
    assert page.get_by_text("集成链路验收完成", exact=True).is_visible()
    goto(page, "/dashboard")
    assert stat(page, "待处理事项") == "0"
    assert stat(page, "7 天内到期") == "0"
    assert next(m for m in state(page)["matters"] if m["id"] == matter_id)["savedAmount"] == 20
    goto(page, f"/matters/{matter_id}")
    page.get_by_role("button", name="恢复待处理", exact=True).click()
    wait_state(page, f"s.matters.find((m) => m.id === '{matter_id}').status === 'active'")
    assert next(m for m in state(page)["matters"] if m["id"] == matter_id)["assessment"]["score"] == score_before_complete
    ok("chain 2: score, reasons, steps, material list, completion and reopen stay consistent")

    # Chain 3: manual subscription -> renewal reminder -> spending forecast -> pause/resume
    renewal_date = future(12)
    goto(page, "/spending")
    assert "0" in page.locator("section[aria-label='订阅支出摘要'] .card").nth(0).locator("p.numeric").inner_text()
    page.get_by_role("button", name="新增订阅", exact=True).first.click()
    dialog = page.get_by_role("dialog", name="新增订阅记录")
    dialog.get_by_label("服务名称", exact=True).fill("集成验收会员")
    dialog.get_by_label("分类", exact=True).fill("影音娱乐")
    dialog.get_by_label("每次扣款金额", exact=True).fill("40")
    dialog.locator("label").filter(has_text="货币单位").locator("select").select_option("CNY")
    dialog.locator("label").filter(has_text="续费周期").locator("select").select_option("monthly")
    dialog.get_by_label("下次续费日期", exact=True).fill(renewal_date)
    dialog.get_by_role("button", name="保存订阅", exact=True).click()
    wait_state(page, "s.subscriptions.some((x) => x.service === '集成验收会员' && x.cycle === 'monthly' && x.autoRenew)")
    subscription = next(x for x in state(page)["subscriptions"] if x["service"] == "集成验收会员")
    sub_id = subscription["id"]
    summary = page.locator("section[aria-label='订阅支出摘要']")
    assert "40" in summary.locator(".card").nth(0).locator("p.numeric").inner_text()
    assert "480" in summary.locator(".card").nth(2).locator("p.numeric").inner_text()
    goto(page, "/radar")
    reminder_section = page.locator("section[aria-label='订阅续费提醒']")
    assert reminder_section.is_visible()
    assert reminder_section.locator(f"a[href='/subscriptions/{sub_id}']").is_visible()
    assert reminder_section.get_by_text("集成验收会员", exact=True).is_visible()
    goto(page, f"/subscriptions/{sub_id}")
    page.get_by_role("button", name="暂停跟踪", exact=True).click()
    wait_state(page, f"s.subscriptions.find((x) => x.id === '{sub_id}').status === 'paused'")
    goto(page, "/radar")
    assert page.locator("section[aria-label='订阅续费提醒']").count() == 0
    goto(page, "/spending")
    assert "0" in page.locator("section[aria-label='订阅支出摘要'] .card").nth(0).locator("p.numeric").inner_text()
    goto(page, f"/subscriptions/{sub_id}")
    page.get_by_role("button", name="恢复跟踪", exact=True).click()
    wait_state(page, f"s.subscriptions.find((x) => x.id === '{sub_id}').status === 'active'")
    goto(page, "/radar")
    assert page.locator(f"section[aria-label='订阅续费提醒'] a[href='/subscriptions/{sub_id}']").is_visible()
    goto(page, "/dashboard")
    assert "40" in stat(page, "每月周期支出")
    page.screenshot(path=OUT / "integration-dashboard-desktop.png", full_page=True)
    goto(page, "/radar")
    page.wait_for_function("window.scrollY === 0")
    page.screenshot(path=OUT / "integration-radar-desktop.png", full_page=True)
    ok("chain 3: subscription drives reminder, monthly/annual forecast and pause/resume everywhere")

    # Chain 4: edit matter -> rescore -> radar window -> dashboard stats
    goto(page, f"/matters/{matter_id}")
    score_before = next(m for m in state(page)["matters"] if m["id"] == matter_id)["assessment"]["score"]
    page.get_by_role("button", name="编辑并重算", exact=True).click()
    page.locator("#edit-matter-form input[inputmode='decimal']").fill("200")
    page.locator("#edit-matter-form input[type='date']").fill(future(25))
    page.get_by_role("button", name="保存并重新计算", exact=True).click()
    wait_state(page, f"s.matters.find((m) => m.id === '{matter_id}').amount === 200")
    edited = next(m for m in state(page)["matters"] if m["id"] == matter_id)
    assert edited["assessment"]["score"] != score_before
    assert any(h["matterId"] == matter_id and h["changes"] for h in state(page)["histories"])
    goto(page, "/dashboard")
    assert stat(page, "待处理事项") == "1"
    assert stat(page, "7 天内到期") == "0"
    goto(page, "/radar")
    assert page.locator(f"a[href='/matters/{matter_id}']").is_visible()
    ok("chain 4: editing rescore, history, radar window and dashboard week stats")

    # Consistency: delete with confirmation, cascading cleanup, subscription kept
    goto(page, f"/matters/{matter_id}")
    page.get_by_role("button", name="删除事项", exact=True).click()
    delete_dialog = page.get_by_role("dialog", name="删除这条生活事项？")
    assert delete_dialog.is_visible()
    delete_dialog.get_by_role("button", name="保留事项", exact=True).click()
    assert page.get_by_role("heading", name="集成验收订单", exact=True).is_visible()
    page.get_by_role("button", name="删除事项", exact=True).click()
    page.get_by_role("dialog", name="删除这条生活事项？").get_by_role("button", name="永久删除", exact=True).click()
    page.wait_for_url("**/radar")
    wait_state(page, f"!s.matters.some((m) => m.id === '{matter_id}')")
    cleaned = state(page)
    assert not any(a["matterId"] == matter_id for a in cleaned["actions"])
    assert not any(h["matterId"] == matter_id for h in cleaned["histories"])
    assert len(cleaned["subscriptions"]) == 1 and len(cleaned["materials"]) == 1
    goto(page, "/dashboard")
    assert stat(page, "待处理事项") == "0"
    assert stat(page, "7 天内到期") == "0"
    assert "40" in stat(page, "每月周期支出")
    goto(page, "/radar")
    assert page.locator(f"section[aria-label='订阅续费提醒'] a[href='/subscriptions/{sub_id}']").is_visible()
    ok("consistency: confirmed delete cascades stats/plans/histories but keeps subscription and material")

    # Consistency: reload persistence and export
    goto(page, "/dashboard")
    assert "40" in stat(page, "每月周期支出")
    assert stat(page, "待处理事项") == "0"
    goto(page, "/settings")
    with page.expect_download() as download_info:
        page.get_by_role("button", name="导出 JSON", exact=True).click()
    download = download_info.value
    download.save_as(OUT / "integration-export.json")
    exported = json.loads((OUT / "integration-export.json").read_text(encoding="utf-8"))
    assert any(x["service"] == "集成验收会员" for x in exported["subscriptions"])
    assert len(exported["matters"]) == 0 and len(exported["materials"]) == 1
    ok("consistency: reload keeps state and export contains the single source of truth")

    # Mobile layout with reminder present
    mobile = browser.new_context(viewport={"width": 390, "height": 844})
    mpage = mobile.new_page()
    attach(mpage)
    for path in ["/dashboard", "/radar", "/spending", f"/subscriptions/{sub_id}"]:
        goto(mpage, path)
        no_overflow(mpage, f"mobile {path}")
    goto(mpage, "/radar")
    mpage.wait_for_function("window.scrollY === 0")
    mpage.screenshot(path=OUT / "integration-radar-mobile.png", full_page=True)
    mobile.close()
    context.close()
    browser.close()

print(json.dumps({"checks": len(checks), "errors": errors, "warnings": warnings}, ensure_ascii=False, indent=2), flush=True)
if errors:
    raise SystemExit(1)