from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
OUT = Path(__file__).parent
FONT_PATH = r"C:\Windows\Fonts\simhei.ttf"
pdfmetrics.registerFont(TTFont("Chinese", FONT_PATH))


def make_image(path, lines, size=(1400, 900), font_size=42):
    image = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT_PATH, font_size)
    y = 70
    for line in lines:
        draw.text((70, y), line, fill="#17233b", font=font)
        y += font_size + 32
    image.save(path)


def make_text_pdf(path, lines):
    doc = canvas.Canvas(str(path))
    doc.setFont("Chinese", 17)
    y = 790
    for line in lines:
        doc.drawString(60, y, line)
        y -= 40
    doc.save()


order_lines = ["订单编号: TEST20261105001", "商品名称: 降噪耳机", "店铺名称: 声浪数码旗舰店", "下单时间: 2026年10月30日", "实付款: CNY 1299.50"]
subscription_lines = ["会员订阅", "会员名称: 云享视频月度会员", "商家: 云享视频", "下次续费日期: 2026年11月08日", "续费金额: CNY 25.00", "自动续费已开启"]
warranty_lines = ["保修凭证", "商品名称: 平板电脑", "销售方: 星河数码", "购买日期: 2025年11月20日", "保修期至: 2026年11月20日", "价税合计: CNY 4299.00"]
lease_lines = ["房屋租赁合同", "租赁房屋: 幸福路1号", "出租方: 林某某", "租赁期限: 2026年01月01日至2027年01月01日", "租金: CNY 3500.00"]
course_lines = ["课程有效期凭证", "课程名称: Python数据分析训练营", "培训机构: 知学教育", "有效期至: 2027年03月31日", "课程费用: CNY 899.00"]
order_pdf = OUT / "order-text.pdf"
subscription_image = OUT / "subscription-ocr.png"
warranty_image = OUT / "warranty-scan.png"
warranty_pdf = OUT / "warranty-scan.pdf"
lease_pdf = OUT / "lease-text.pdf"
course_pdf = OUT / "course-text.pdf"
invalid_pdf = OUT / "invalid.pdf"
make_text_pdf(order_pdf, order_lines)
make_image(subscription_image, subscription_lines)
make_image(warranty_image, warranty_lines, size=(1400, 1100), font_size=46)
Image.open(warranty_image).convert("RGB").save(warranty_pdf, "PDF", resolution=150)
make_text_pdf(lease_pdf, lease_lines)
make_text_pdf(course_pdf, course_lines)
invalid_pdf.write_bytes(b"not a valid pdf")

errors = []
warnings = []
checks = []


def ok(message):
    checks.append(message)
    print(f"PASS {message}", flush=True)


def attach(page):
    def on_console(msg):
        if msg.text.startswith("Warning: Parameter not found:"):
            warnings.append(f"OCR engine: {msg.text}")
        elif msg.type == "error":
            errors.append(f"console: {msg.text}")
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    page.on("console", on_console)


def upload(page, path, navigate=True):
    page.goto(f"{BASE}/materials", wait_until="networkidle")
    page.get_by_role("button", name="上传材料", exact=True).first.click()
    page.get_by_role("dialog", name="上传生活材料").locator("input[type='file']").set_input_files(str(path))
    page.get_by_role("button", name="添加并确认材料", exact=True).click()
    if navigate:
        page.wait_for_url("**/materials?material=*")


def wait_finished(page, timeout=240000):
    page.wait_for_function("""() => {
      const id = new URLSearchParams(location.search).get('material')
      const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
      if (!id || !raw) return false
      const material = JSON.parse(raw).materials.find((item) => item.id === id)
      return material && ['awaiting_confirmation', 'ready', 'error'].includes(material.status)
    }""", timeout=timeout)
    try:
        page.wait_for_function("""() => {
          const id = new URLSearchParams(location.search).get('material')
          const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
          const material = id && raw ? JSON.parse(raw).materials.find((item) => item.id === id) : null
          const button = document.querySelector('button[form="material-fields-form"]')
          return material && document.querySelector('#material-title')?.textContent === material.name && button && !button.disabled
        }""", timeout=timeout)
    except Exception:
        print("Wait diagnostics:", json.dumps(page.evaluate("""() => {
          const id = new URLSearchParams(location.search).get('material')
          const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
          const material = id && raw ? JSON.parse(raw).materials.find((item) => item.id === id) : null
          const button = document.querySelector('button[form="material-fields-form"]')
          return { id, material, title: document.querySelector('#material-title')?.textContent, button: button ? { disabled: button.disabled, text: button.textContent } : null }
        }"""), ensure_ascii=True), flush=True)
        raise


def field(page, label):
    return page.locator("#material-fields-form label").filter(has_text=label).locator("input, textarea").first


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    attach(page)
    external_writes = []
    page.on("request", lambda request: external_writes.append(f"{request.method} {request.url}") if request.method not in ["GET", "OPTIONS"] else None)

    upload(page, order_pdf)
    wait_finished(page, timeout=30000)
    assert page.get_by_text("PDF 文本层", exact=True).is_visible()
    assert page.locator("label").filter(has_text="材料类型").locator("select").first.input_value() == "订单"
    assert field(page, "事项名称").input_value() == "降噪耳机"
    assert field(page, "金额").input_value() == "1299.50"
    assert field(page, "购买 / 下单日期").input_value() == "2026-10-30"
    assert field(page, "到期 / 退货截止日期").input_value() == ""
    assert field(page, "下次续费日期").input_value() == ""
    ok("text PDF extraction preserves purchase date without inventing deadline")

    rule_checks = page.evaluate("""async () => {
      const { recognizeFields } = await import('/src/features/materials/recognitionRules.ts')
      return {
        valid: recognizeFields('订单编号: A1\\n下单时间: 2026-11-05\\n实付款: ¥1299.50', null),
        invalid: recognizeFields('订单编号: A2\\n下单时间: 2026-11-200\\n实付款: CNY 25.000', null),
      }
    }""")
    assert rule_checks["valid"]["amount"] == "1299.50" and rule_checks["valid"]["currency"] == "CNY"
    assert rule_checks["valid"]["purchase_date"] == "2026-11-05"
    assert rule_checks["invalid"]["amount"] is None and rule_checks["invalid"]["purchase_date"] is None
    ok("currency and numeric boundaries reject partial dates and decimals")

    page.get_by_role("button", name="重新识别", exact=True).click()
    wait_finished(page)
    assert field(page, "购买 / 下单日期").input_value() == "2026-10-30"
    page.get_by_role("button", name="清除识别结果", exact=True).click()
    page.get_by_role("button", name="清除结果", exact=True).click()
    page.get_by_role("button", name="手工录入", exact=True).click()
    assert field(page, "事项名称").input_value() == ""
    page.get_by_role("button", name="重新识别", exact=True).click()
    wait_finished(page)
    field(page, "事项名称").fill("降噪耳机（已核对）")
    page.get_by_role("button", name="确认字段并生成事项", exact=True).click()
    page.wait_for_url("**/matters/*")
    assert page.get_by_role("heading", name="降噪耳机（已核对）", exact=True).is_visible()
    assert page.get_by_text("日期待确认", exact=True).first.is_visible()
    matter = page.evaluate("() => { const state = JSON.parse(localStorage.getItem('lifeguard.demo.workspace.v1')); return state.matters.find((item) => item.title === '降噪耳机（已核对）') }")
    assert matter["dueDate"] is None and matter["amount"] == 1299.5 and matter["currency"] == "CNY"
    ok("edit, clear, re-recognize and confirm matter with null deadline")

    upload(page, order_pdf, navigate=False)
    page.get_by_text("这份文件已上传过", exact=False).wait_for(state="visible")
    page.get_by_role("button", name="取消", exact=True).click()
    ok("duplicate PDF detection")

    upload(page, invalid_pdf)
    wait_finished(page)
    assert page.get_by_text("本地文字提取未完成", exact=False).first.is_visible()
    page.get_by_role("button", name="手工录入", exact=True).click()
    assert field(page, "事项名称").input_value() == ""
    ok("corrupt PDF falls back to manual entry")

    upload(page, subscription_image)
    wait_finished(page)
    assert page.get_by_text("浏览器 OCR", exact=True).is_visible()
    assert page.get_by_text("查看本次提取文本", exact=True).is_visible()
    page.get_by_text("查看本次提取文本", exact=True).click()
    print("OCR subscription text:", json.dumps(page.locator("details pre").inner_text(), ensure_ascii=True), flush=True)
    print("OCR subscription values:", json.dumps({"type": page.locator("label").filter(has_text="材料类型").locator("select").first.input_value(), "title": field(page, "事项名称").input_value(), "amount": field(page, "金额").input_value(), "renewal": field(page, "下次续费日期").input_value()}, ensure_ascii=True), flush=True)
    assert field(page, "金额").input_value() == "25.00"
    assert field(page, "下次续费日期").input_value() == "2026-11-08"
    page.screenshot(path=OUT / "recognition-image-desktop.png", full_page=True)
    ok("image OCR extracts renewal date and decimal amount")

    upload(page, warranty_pdf)
    wait_finished(page)
    assert page.get_by_text("PDF 扫描页 OCR", exact=True).is_visible()
    print("OCR warranty values:", json.dumps({"type": page.locator("label").filter(has_text="材料类型").locator("select").first.input_value(), "title": field(page, "事项名称").input_value(), "purchase": field(page, "购买 / 下单日期").input_value(), "expiry": field(page, "到期 / 退货截止日期").input_value()}, ensure_ascii=False), flush=True)
    assert field(page, "购买 / 下单日期").input_value() == "2025-11-20"
    assert field(page, "到期 / 退货截止日期").input_value() == "2026-11-20"
    ok("scanned PDF OCR keeps purchase and warranty dates distinct")

    page.get_by_role("button", name="删除材料与记录", exact=True).click()
    page.get_by_role("button", name="确认删除", exact=True).click()
    assert page.get_by_text("材料与识别记录已删除", exact=True).is_visible()
    ok("delete uploaded file and recognition record")

    upload(page, lease_pdf)
    wait_finished(page, timeout=30000)
    assert page.locator("label").filter(has_text="材料类型").locator("select").first.input_value() == "合同"
    assert field(page, "生效日期").input_value() == "2026-01-01"
    assert field(page, "到期 / 退货截止日期").input_value() == "2027-01-01"
    assert field(page, "金额").input_value() == "3500.00"
    ok("lease PDF separates effective and expiry dates")

    upload(page, course_pdf)
    wait_finished(page, timeout=30000)
    assert page.locator("label").filter(has_text="材料类型").locator("select").first.input_value() == "其他"
    assert page.locator("label").filter(has_text="材料类型").get_by_text("待确认", exact=True).is_visible()
    assert page.locator("label").filter(has_text="事项类型").locator("select").first.input_value() == "course"
    assert field(page, "到期 / 退货截止日期").input_value() == "2027-03-31"
    ok("course credential maps to course matter without inventing document type")

    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(f"{BASE}/materials", wait_until="networkidle")
    assert page.evaluate("document.documentElement.scrollWidth") <= 391
    page.screenshot(path=OUT / "recognition-mobile.png", full_page=True)
    ok("mobile recognition workspace has no horizontal overflow")

    assert not external_writes, external_writes
    ok("no file or text sent through write requests")
    context.close()
    browser.close()

print(json.dumps({"checks": len(checks), "errors": errors, "ocr_engine_warnings": sorted(set(warnings))}, ensure_ascii=False, indent=2), flush=True)
if errors:
    raise SystemExit(1)
