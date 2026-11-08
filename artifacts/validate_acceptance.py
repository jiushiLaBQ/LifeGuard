"""LifeGuard 功能验收：10 项真实浏览器操作。所有材料均为虚构生成，不含真实私人信息。"""
from pathlib import Path
from datetime import date, timedelta
import json
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:5173"
OUT = Path(__file__).parent
FONT_PATH = r"C:\Windows\Fonts\simhei.ttf"
pdfmetrics.registerFont(TTFont("Chinese", FONT_PATH))
TODAY = date.today()


def iso(offset):
    return (TODAY + timedelta(days=offset)).isoformat()


def cn(offset):
    day = TODAY + timedelta(days=offset)
    return f"{day.year}年{day.month}月{day.day}日"


def make_image(path, lines, size=(1400, 1000), font_size=44):
    image = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT_PATH, font_size)
    y = 70
    for line in lines:
        draw.text((70, y), line, fill="#17233b", font=font)
        y += font_size + 34
    image.save(path)


order_lines = [
    "订单编号: ACC20261107001",
    "商品名称: 无线降噪耳机",
    "店铺名称: 声浪数码旗舰店",
    f"下单时间: {cn(-9)}",
    "实付款: CNY 899.00",
    f"退货截止日: {cn(3)}",
]
clear_image = OUT / "acceptance-order-clear.png"
blur_image = OUT / "acceptance-order-blur.png"
noise_image = OUT / "acceptance-noise.png"
blank_pdf = OUT / "acceptance-blank.pdf"
corrupt_pdf = OUT / "acceptance-corrupt.pdf"
make_image(clear_image, order_lines)
Image.open(clear_image).filter(ImageFilter.GaussianBlur(11)).save(blur_image)
Image.effect_noise((1200, 800), 60).convert("RGB").save(noise_image)
doc = canvas.Canvas(str(blank_pdf))
doc.showPage()
doc.save()
corrupt_pdf.write_bytes(b"%PDF-1.7 this is not a real pdf body")

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
    return page.evaluate("JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1'))")


def wait_state(page, expr, timeout=30000):
    page.wait_for_function(
        f"() => {{ const s = JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1')); return {expr} }}",
        timeout=timeout,
    )


def stat(page, label):
    return page.locator(".card").filter(has_text=label).locator("p.numeric").first.inner_text().strip()


def upload(page, path, navigate=True):
    goto(page, "/materials")
    page.get_by_role("button", name="上传材料", exact=True).first.click()
    page.get_by_role("dialog", name="上传生活材料").locator("input[type='file']").set_input_files(str(path))
    page.get_by_role("button", name="添加并确认材料", exact=True).click()
    if navigate:
        page.wait_for_url("**/materials?material=*")


def current_material(page):
    return page.evaluate("""() => {
      const id = new URLSearchParams(location.search).get('material')
      const s = JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1'))
      return s.materials.find((item) => item.id === id) ?? null
    }""")


def wait_finished(page, timeout=240000):
    page.wait_for_function("""() => {
      const id = new URLSearchParams(location.search).get('material')
      const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
      if (!id || !raw) return false
      const material = JSON.parse(raw).materials.find((item) => item.id === id)
      const button = document.querySelector('button[form="material-fields-form"]')
      return material && ['awaiting_confirmation', 'ready', 'error'].includes(material.status)
        && document.querySelector('#material-title')?.textContent === material.name
        && (material.status === 'error' || (button && !button.disabled))
    }""", timeout=timeout)


def field(page, label):
    return page.locator("#material-fields-form label").filter(has_text=label).locator("input, textarea").first


def field_label(page, label):
    return page.locator("#material-fields-form label").filter(has_text=label).first


def dump_fields(page, tag):
    material = current_material(page)
    print(f"{tag} status={material['status']} engine={material.get('recognitionEngine')} message={material.get('message')}", flush=True)
    print(f"{tag} text={json.dumps(page.evaluate('''() => {
      const el = document.querySelector('details pre'); return el ? el.textContent : ''
    }'''), ensure_ascii=False)}", flush=True)
    print(f"{tag} fields={json.dumps([{k: f[k] for k in ('key', 'value', 'confidence', 'status')} for f in material['fields']], ensure_ascii=False)}", flush=True)
    return material


def assert_no_fabrication(page, tag):
    material = current_material(page)
    assert material["status"] != "ready", f"{tag}: 未经用户确认就标记为已确认"
    for item in material["fields"]:
        assert item["status"] == "pending", f"{tag}: 字段 {item['key']} 被自动确认"
        if item["value"].strip():
            assert item["confidence"] is None or item["confidence"] < 100, f"{tag}: 字段 {item['key']} 声称满可信度"


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
    page = context.new_page()
    attach(page)
    external_writes = []
    page.on("request", lambda request: external_writes.append(f"{request.method} {request.url}") if request.method not in ["GET", "OPTIONS"] else None)

    goto(page, "/settings")
    page.get_by_role("button", name="清空记录", exact=True).click()
    page.get_by_placeholder("清空", exact=True).fill("清空")
    page.get_by_role("button", name="永久清空", exact=True).click()
    wait_state(page, "s.matters.length === 0 && s.materials.length === 0 && s.subscriptions.length === 0")
    goto(page, "/dashboard")
    assert stat(page, "待处理事项") == "0"
    ok("F0 空白工作区基线：统计全部归零")

    # F1 正常订单截图
    upload(page, clear_image)
    wait_finished(page)
    assert page.get_by_text("浏览器 OCR", exact=True).is_visible()
    material = dump_fields(page, "F1-clear")
    assert field(page, "事项名称").input_value() == "无线降噪耳机"
    assert field(page, "金额").input_value() == "899.00"
    assert field(page, "购买 / 下单日期").input_value() == iso(-9)
    assert field(page, "到期 / 退货截止日期").input_value() == iso(3)
    assert field(page, "下次续费日期").input_value() == ""
    assert page.locator("label").filter(has_text="材料类型").locator("select").first.input_value() == "订单"
    assert_no_fabrication(page, "F1")
    ok("F1 上传正常订单截图：OCR 提取商品、金额、下单日与退货截止日，未编造续费日")
    order_material_id = material["id"]

    # F6 修改错误的 OCR 结果（含非法输入拦截）
    field(page, "金额").fill("89.00")
    assert field_label(page, "金额").get_by_text("已由你修改", exact=False).is_visible()
    field(page, "金额").fill("12.345")
    page.get_by_role("button", name="确认字段并生成事项", exact=True).click()
    assert page.locator("#material-fields-form .field-error").inner_text() == "金额需为非负数字，最多两位小数"
    assert len(state(page)["matters"]) == 0
    field(page, "金额").fill("899.00")
    field(page, "事项名称").fill("无线降噪耳机（已核对）")
    page.get_by_role("button", name="确认字段并生成事项", exact=True).click()
    page.wait_for_url("**/matters/*")
    wait_state(page, "s.matters.some((m) => m.title === '无线降噪耳机（已核对）')")
    order_matter = next(m for m in state(page)["matters"] if m["title"] == "无线降噪耳机（已核对）")
    order_matter_id = order_matter["id"]
    assert order_matter["amount"] == 899.0 and order_matter["currency"] == "CNY"
    assert order_matter["dueDate"] == iso(3)
    assert order_matter["provenance"]["amount"]["source"] == "user" and order_matter["provenance"]["amount"]["confirmed"]
    assert order_matter["assessment"]["score"] > 0
    assert any(a["matterId"] == order_matter_id for a in state(page)["actions"])
    goto(page, f"/materials?material={order_material_id}")
    assert page.get_by_text("确认记录已保存", exact=True).is_visible()
    assert field(page, "金额").is_disabled() or field(page, "金额").get_attribute("readonly") is not None
    ok("F6 修改错误 OCR 结果：非法金额被拦截，修改后来源标记为用户核对，确认后字段只读")

    # F2 模糊图片
    matter_count = len(state(page)["matters"])
    upload(page, blur_image)
    wait_finished(page)
    blur = dump_fields(page, "F2-blur")
    assert_no_fabrication(page, "F2")
    assert len(state(page)["matters"]) == matter_count
    blur_values = [f["value"] for f in blur["fields"] if f["value"].strip()]
    if blur_values:
        note(f"F2 模糊图片仍产出 {len(blur_values)} 个候选值，全部保持待确认且未生成事项：{blur_values}")
    else:
        ok("F2 上传模糊图片：未产出任何候选字段，未生成事项")
    if not blur_values:
        assert "没有提取到可用字段" in (blur.get("message") or "")
        ok("F2 模糊图片给出明确的空结果说明与手工录入指引")
    page.screenshot(path=OUT / "acceptance-blur-desktop.png", full_page=True)

    # F3 空白 PDF
    upload(page, blank_pdf)
    wait_finished(page)
    blank = dump_fields(page, "F3-blank")
    assert_no_fabrication(page, "F3")
    assert all(not f["value"].strip() for f in blank["fields"]), "空白 PDF 不应产生任何字段值"
    assert "没有提取到可用字段" in (blank.get("message") or "")
    assert page.locator("label").filter(has_text="材料类型").locator("select").first.input_value() == "其他"
    assert page.locator("label").filter(has_text="材料类型").get_by_text("待确认", exact=True).is_visible()
    assert len(state(page)["matters"]) == matter_count
    ok("F3 上传空白 PDF：零字段、类型待确认、明确提示手工录入，未生成事项")

    # F4 重复材料
    material_count = len(state(page)["materials"])
    upload(page, clear_image, navigate=False)
    page.get_by_text("这份文件已上传过", exact=False).wait_for(state="visible")
    page.get_by_role("button", name="取消", exact=True).click()
    assert len(state(page)["materials"]) == material_count
    ok("F4 上传重复材料：SHA-256 命中提示并阻止重复入库")

    # F5 无法识别的材料（噪声图片 + 损坏 PDF）
    upload(page, noise_image)
    wait_finished(page)
    noise = dump_fields(page, "F5-noise")
    assert_no_fabrication(page, "F5")
    assert len(state(page)["matters"]) == matter_count
    if noise["status"] == "error":
        page.get_by_role("button", name="手工录入", exact=True).click()
    else:
        page.get_by_role("button", name="清除识别结果", exact=True).click()
        page.get_by_role("button", name="清除结果", exact=True).click()
        page.get_by_role("button", name="手工录入", exact=True).click()
    assert field(page, "事项名称").input_value() == ""
    field(page, "事项名称").fill("噪声材料手工补录")
    field(page, "商家 / 机构").fill("虚构办理机构")
    field(page, "金额").fill("150")
    field(page, "到期 / 退货截止日期").fill(iso(6))
    page.locator("label").filter(has_text="货币单位").locator("select").first.select_option("CNY")
    page.get_by_role("button", name="确认字段并生成事项", exact=True).click()
    page.wait_for_url("**/matters/*")
    wait_state(page, "s.matters.some((m) => m.title === '噪声材料手工补录')")
    manual_matter = next(m for m in state(page)["matters"] if m["title"] == "噪声材料手工补录")
    assert manual_matter["amount"] == 150 and manual_matter["dueDate"] == iso(6)
    assert manual_matter["provenance"]["amount"]["source"] == "user"
    ok("F5a 无法识别的图片：不猜测字段，手工录入后正常生成事项")

    upload(page, corrupt_pdf)
    wait_finished(page)
    assert page.get_by_text("本地文字提取未完成", exact=False).first.is_visible()
    page.get_by_role("button", name="手工录入", exact=True).click()
    assert field(page, "事项名称").input_value() == ""
    page.get_by_role("button", name="删除材料与记录", exact=True).click()
    page.get_by_role("button", name="确认删除", exact=True).click()
    assert page.get_by_text("材料与识别记录已删除", exact=True).is_visible()
    ok("F5b 损坏 PDF：明确失败原因、可手工录入，删除材料同时移除识别记录")

    # F7 新建与删除事项
    goto(page, "/dashboard")
    page.get_by_role("button", name="新建事项", exact=True).first.click()
    dialog = page.get_by_role("dialog", name="新建生活事项")
    dialog.locator("#matter-title").fill("手工验收事项")
    dialog.locator("#matter-merchant").fill("虚构服务中心")
    dialog.locator("#matter-amount").fill("300")
    dialog.locator("#matter-date").fill(iso(6))
    dialog.locator("#matter-action").fill("核对通知并在官方入口办理")
    dialog.get_by_role("button", name="创建并生成行动清单", exact=True).click()
    page.wait_for_url("**/matters/*")
    wait_state(page, "s.matters.some((m) => m.title === '手工验收事项')")
    created = next(m for m in state(page)["matters"] if m["title"] == "手工验收事项")
    created_id = created["id"]
    assert created["source"] == "manual" and created["assessment"]["score"] > 0
    assert any(a["matterId"] == created_id and len(a["steps"]) >= 3 for a in state(page)["actions"])
    assert page.locator("section[aria-labelledby='assessment-title']").is_visible()
    goto(page, "/dashboard")
    assert stat(page, "待处理事项") == "3"
    page.get_by_role("button", name="新建事项", exact=True).first.click()
    page.get_by_role("dialog", name="新建生活事项").get_by_role("button", name="取消", exact=True).click()
    goto(page, f"/matters/{created_id}")
    page.get_by_role("button", name="删除事项", exact=True).click()
    page.get_by_role("dialog", name="删除这条生活事项？").get_by_role("button", name="保留事项", exact=True).click()
    assert page.get_by_role("heading", name="手工验收事项", exact=True).is_visible()
    page.get_by_role("button", name="删除事项", exact=True).click()
    page.get_by_role("dialog", name="删除这条生活事项？").get_by_role("button", name="永久删除", exact=True).click()
    page.wait_for_url("**/radar")
    wait_state(page, f"!s.matters.some((m) => m.id === '{created_id}')")
    cleaned = state(page)
    assert not any(a["matterId"] == created_id for a in cleaned["actions"])
    assert not any(h["matterId"] == created_id for h in cleaned["histories"])
    goto(page, "/dashboard")
    assert stat(page, "待处理事项") == "2"
    ok("F7 新建与删除事项：创建即生成评分与行动清单，取消不删除，确认后级联清理并同步统计")

    # F8 修改事项截止日期
    goto(page, f"/matters/{order_matter_id}")
    before = next(m for m in state(page)["matters"] if m["id"] == order_matter_id)
    score_before = before["assessment"]["score"]
    goto(page, "/dashboard")
    week_before = int(stat(page, "7 天内到期"))
    goto(page, f"/matters/{order_matter_id}")
    page.get_by_role("button", name="编辑并重算", exact=True).click()
    page.locator("#edit-matter-form input[type='date']").fill(iso(40))
    page.get_by_role("button", name="保存并重新计算", exact=True).click()
    wait_state(page, f"s.matters.find((m) => m.id === '{order_matter_id}').dueDate === '{iso(40)}'")
    after = next(m for m in state(page)["matters"] if m["id"] == order_matter_id)
    assert after["assessment"]["score"] < score_before, f"延长期限后评分应下降：{score_before} -> {after['assessment']['score']}"
    assert after["provenance"]["dueDate"]["source"] == "user" and after["provenance"]["dueDate"]["confirmed"]
    assert any(h["matterId"] == order_matter_id and h["changes"] for h in state(page)["histories"])
    assert page.get_by_text(iso(40), exact=False).first.is_visible()
    goto(page, "/dashboard")
    assert int(stat(page, "7 天内到期")) == week_before - 1
    goto(page, "/radar")
    assert page.locator(f"a[href='/matters/{order_matter_id}']").count() == 0, "40 天后的期限不应出现在默认 30 天窗口"
    page.locator("label").filter(has_text="时间范围").locator("select").select_option("all")
    assert page.locator(f"a[href='/matters/{order_matter_id}']").is_visible()
    ok(f"F8 修改截止日期：评分 {score_before} → {after['assessment']['score']}，来源改为用户确认，历史留痕，周统计与雷达窗口同步")

    # F9 新增与修改订阅
    goto(page, "/spending")
    page.get_by_role("button", name="新增订阅", exact=True).first.click()
    dialog = page.get_by_role("dialog", name="新增订阅记录")
    dialog.get_by_label("服务名称", exact=True).fill("验收视频会员")
    dialog.get_by_label("分类", exact=True).fill("影音娱乐")
    dialog.get_by_label("每次扣款金额", exact=True).fill("30")
    dialog.locator("label").filter(has_text="货币单位").locator("select").select_option("CNY")
    dialog.locator("label").filter(has_text="续费周期").locator("select").select_option("monthly")
    dialog.get_by_label("下次续费日期", exact=True).fill(iso(4))
    dialog.get_by_role("button", name="保存订阅", exact=True).click()
    wait_state(page, "s.subscriptions.some((x) => x.service === '验收视频会员')")
    subscription = next(x for x in state(page)["subscriptions"] if x["service"] == "验收视频会员")
    sub_id = subscription["id"]
    summary = page.locator("section[aria-label='订阅支出摘要']")
    assert "30" in summary.locator(".card").nth(0).locator("p.numeric").inner_text()
    assert "360" in summary.locator(".card").nth(2).locator("p.numeric").inner_text()
    goto(page, "/radar")
    assert page.locator(f"section[aria-label='订阅续费提醒'] a[href='/subscriptions/{sub_id}']").is_visible()
    goto(page, f"/subscriptions/{sub_id}")
    page.get_by_role("button", name="编辑", exact=True).click()
    edit = page.get_by_role("dialog", name="编辑订阅记录")
    edit.get_by_label("每次扣款金额", exact=True).fill("480")
    edit.locator("label").filter(has_text="续费周期").locator("select").select_option("yearly")
    edit.get_by_role("button", name="保存订阅", exact=True).click()
    wait_state(page, f"s.subscriptions.find((x) => x.id === '{sub_id}').cycle === 'yearly'")
    edited_sub = next(x for x in state(page)["subscriptions"] if x["id"] == sub_id)
    assert edited_sub["amount"] == 480 and edited_sub["cycle"] == "yearly"
    goto(page, "/spending")
    assert "40" in page.locator("section[aria-label='订阅支出摘要'] .card").nth(0).locator("p.numeric").inner_text()
    goto(page, "/dashboard")
    assert "40" in stat(page, "每月周期支出")
    goto(page, f"/subscriptions/{sub_id}")
    assert "¥40" in page.locator("header.card").inner_text()
    assert page.locator("section[aria-labelledby='schedule-title'] li").count() >= 1
    ok("F9 新增与修改订阅：月付 30 → 年付 480，每月等值 40，摘要、仪表板、扣款安排全部重算")

    # F10 跨页面数据同步与持久化
    snapshot = state(page)
    active = [m for m in snapshot["matters"] if m["status"] == "active"]
    goto(page, "/dashboard")
    assert stat(page, "待处理事项") == str(len(active))
    goto(page, "/radar")
    page.locator("label").filter(has_text="时间范围").locator("select").select_option("all")
    for matter in active:
        if matter["dueDate"]:
            assert page.locator(f"a[href='/matters/{matter['id']}']").count() >= 1
    goto(page, "/materials")
    assert page.locator("section[aria-label='材料列表']").get_by_text(f"{len(snapshot['materials'])} 份", exact=True).is_visible()
    goto(page, "/spending")
    assert page.get_by_text("验收视频会员", exact=False).first.is_visible()
    goto(page, "/settings")
    capability = page.locator("section[aria-labelledby='capability-title']")
    assert capability.get_by_text("未接入 · 当前无服务端数据库", exact=True).is_visible()
    assert capability.get_by_text("未接入 · 打开应用可查看站内期限", exact=True).is_visible()
    page.reload(wait_until="networkidle")
    assert len(state(page)["matters"]) == len(snapshot["matters"])
    assert len(state(page)["subscriptions"]) == len(snapshot["subscriptions"])
    with page.expect_download() as download_info:
        page.get_by_role("button", name="导出 JSON", exact=True).click()
    download_info.value.save_as(OUT / "acceptance-export.json")
    exported = json.loads((OUT / "acceptance-export.json").read_text(encoding="utf-8"))
    assert len(exported["matters"]) == len(snapshot["matters"])
    assert any(x["service"] == "验收视频会员" and x["amount"] == 480 for x in exported["subscriptions"])
    assert all("previewUrl" not in m for m in exported["materials"])
    goto(page, "/dashboard")
    page.wait_for_function("window.scrollY === 0")
    page.screenshot(path=OUT / "acceptance-dashboard-desktop.png", full_page=True)
    assert not external_writes, external_writes
    ok("F10 跨页面同步：仪表板/雷达/材料/消费计数一致，设置页如实标注未接入能力，刷新与导出保持单一数据源，材料预览地址不外泄，无外发写请求")

    context.close()
    browser.close()

print(json.dumps({"checks": len(checks), "findings": findings, "errors": errors, "ocr_engine_warnings": sorted(set(warnings))}, ensure_ascii=False, indent=2), flush=True)
if errors:
    raise SystemExit(1)