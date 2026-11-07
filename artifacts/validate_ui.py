from pathlib import Path
import base64
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


def wait_material_finished(page):
    page.wait_for_function("""() => {
      const id = new URLSearchParams(location.search).get('material')
      const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
      if (!id || !raw) return false
      const material = JSON.parse(raw).materials.find((item) => item.id === id)
      return material && ['awaiting_confirmation', 'ready', 'error'].includes(material.status)
    }""", timeout=240000)
    page.wait_for_function("""() => {
      const id = new URLSearchParams(location.search).get('material')
      const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
      const material = id && raw ? JSON.parse(raw).materials.find((item) => item.id === id) : null
      const button = document.querySelector('button[form="material-fields-form"]')
      return material && document.querySelector('#material-title')?.textContent === material.name && button && !button.disabled
    }""", timeout=240000)


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

    routes = [
        ("/welcome", "重要的期限"),
        ("/dashboard", "先处理最值得优先投入的事"),
        ("/materials", "本地识别，确认后才成为事项"),
        ("/radar", "看见接下来要发生的事"),
        ("/actions", "把期限变成可以完成的步骤"),
        ("/spending", "知道每一笔钱为何继续发生"),
        ("/settings", "你的数据边界"),
        ("/matters/matter-headphones", "降噪耳机退货"),
        ("/matters/not-a-real-id", "没有找到这个事项"),
        ("/not-a-route", "这个页面不存在"),
    ]
    for path, text in routes:
        goto(page, path)
        assert page.get_by_text(text, exact=False).first.is_visible(), path
        no_overflow(page, f"desktop {path}")
    page.screenshot(path=OUT / "dashboard-desktop.png", full_page=True)

    goto(page, "/dashboard")
    page.get_by_role("button", name="新建生活事项", exact=True).click()
    page.get_by_role("button", name="创建并生成行动清单", exact=True).click()
    assert page.get_by_text("请输入事项名称", exact=True).is_visible()
    page.locator("#matter-title").fill("浏览器验收事项")
    page.locator("#matter-merchant").fill("本地测试商家")
    page.locator("#matter-amount").fill("88.50")
    page.locator("#matter-date").fill("2026-12-31")
    page.locator("#matter-action").fill("核对记录并完成测试")
    page.get_by_role("button", name="创建并生成行动清单", exact=True).click()
    page.wait_for_url("**/matters/*")
    assert page.get_by_role("heading", name="浏览器验收事项", exact=True).is_visible()
    ok("new matter validation and creation")

    page.get_by_role("button", name="编辑并重算", exact=True).click()
    page.locator("#edit-matter-form input").nth(0).fill("浏览器验收事项（已编辑）")
    page.get_by_role("button", name="保存并重新计算", exact=True).click()
    assert page.get_by_role("heading", name="浏览器验收事项（已编辑）", exact=True).is_visible()
    page.get_by_role("button", name="标记完成", exact=True).click()
    page.get_by_label("处理结果", exact=True).fill("已完成浏览器验收")
    page.get_by_label("确认少支出或挽回金额（可选）", exact=True).fill("8.50")
    page.get_by_role("button", name="保存完成记录", exact=True).click()
    assert page.get_by_text("已完成浏览器验收", exact=True).is_visible()
    page.get_by_role("button", name="恢复待处理", exact=True).click()
    assert page.get_by_role("button", name="标记完成", exact=True).is_visible()
    ok("matter edit, completion and restore")

    goto(page, "/actions")
    step = page.locator("label").filter(has_text="向商家提交售后请求").first
    step.click()
    assert step.locator("input[type='checkbox']").is_checked()
    page.get_by_role("button", name="复制", exact=True).click()
    page.get_by_text("沟通文本已复制", exact=True).wait_for(state="visible")
    ok("action step toggle and clipboard")

    goto(page, "/dashboard")
    page.keyboard.press("Control+k")
    dialog = page.get_by_role("dialog")
    assert dialog.is_visible()
    dialog.locator("input").fill("耳机")
    assert dialog.get_by_text("降噪耳机退货", exact=True).first.is_visible()
    page.keyboard.press("Escape")
    ok("global keyboard search")

    image_path = OUT / "validation-pixel.png"
    image_path.write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="))
    goto(page, "/materials")
    page.get_by_role("button", name="上传材料", exact=True).first.click()
    page.get_by_role("dialog", name="上传生活材料").locator("input[type='file']").set_input_files(str(image_path))
    page.get_by_role("button", name="添加并确认材料", exact=True).click()
    page.wait_for_url("**/materials?material=*")
    wait_material_finished(page)
    fields = page.locator("#material-fields-form input")
    fields.nth(0).fill("浏览器验收材料")
    fields.nth(1).fill("本地材料商家")
    fields.nth(2).fill("19.90")
    fields.nth(3).fill("2026-11-20")
    page.locator("label").filter(has_text="货币单位").locator("select").select_option("CNY")
    page.get_by_role("button", name="确认字段并生成事项", exact=True).click()
    page.wait_for_url("**/matters/*")
    assert page.get_by_role("heading", name="浏览器验收材料", exact=True).is_visible()
    ok("local image upload and material confirmation")

    goto(page, "/materials")
    page.get_by_role("button", name="上传材料", exact=True).first.click()
    page.get_by_role("dialog", name="上传生活材料").locator("input[type='file']").set_input_files(str(image_path))
    page.get_by_role("button", name="添加并确认材料", exact=True).click()
    page.get_by_text("这份文件已上传过", exact=False).wait_for(state="visible")
    page.get_by_role("button", name="取消", exact=True).click()
    ok("duplicate file hash detection")

    goto(page, "/radar")
    page.get_by_placeholder("搜索事项或商家").fill("绝不存在的事项")
    assert page.get_by_text("没有符合条件的期限", exact=True).is_visible()
    page.get_by_role("button", name="重置筛选", exact=True).first.click()
    assert page.get_by_text("降噪耳机退货", exact=True).first.is_visible()
    ok("radar filters and empty state")

    goto(page, "/spending")
    assert page.locator("canvas").count() == 2
    page.screenshot(path=OUT / "spending-desktop.png", full_page=True)
    page.get_by_role("button", name="并不重复", exact=True).first.click()
    assert page.get_by_text("已标记为不同服务", exact=True).is_visible()
    ok("spending charts and duplicate decision")

    goto(page, "/settings")
    page.locator("input[autocomplete='name']").fill("")
    page.get_by_role("button", name="保存设置", exact=True).click()
    assert page.get_by_text("请填写称呼", exact=True).is_visible()
    page.locator("input[autocomplete='name']").fill("林晓")
    page.get_by_role("button", name="保存设置", exact=True).click()
    with page.expect_download() as download_info:
        page.get_by_role("button", name="导出 JSON", exact=True).click()
    download = download_info.value
    assert download.suggested_filename.endswith(".json")
    download.save_as(OUT / download.suggested_filename)
    exported = json.loads((OUT / download.suggested_filename).read_text(encoding="utf-8"))
    assert exported["mode"] == "lifeguard-local-demo" and "matters" in exported
    ok("settings validation and JSON export")

    page.get_by_role("button", name="清空记录", exact=True).click()
    page.get_by_placeholder("清空", exact=True).fill("清空")
    page.get_by_role("button", name="永久清空", exact=True).click()
    goto(page, "/dashboard")
    assert page.get_by_text("近期没有待处理期限", exact=True).is_visible()
    goto(page, "/settings")
    page.get_by_role("button", name="重新载入", exact=True).first.click()
    page.get_by_role("button", name="重新载入", exact=True).last.click()
    goto(page, "/dashboard")
    assert page.get_by_text("降噪耳机退货", exact=True).first.is_visible()
    ok("empty workspace and demo reset")
    page.screenshot(path=OUT / "dashboard-desktop.png", full_page=True)

    mobile = browser.new_context(viewport={"width": 390, "height": 844})
    mpage = mobile.new_page()
    attach(mpage)
    for path in ["/welcome", "/dashboard", "/materials", "/radar", "/actions", "/spending", "/settings", "/matters/matter-headphones"]:
        goto(mpage, path)
        no_overflow(mpage, f"mobile {path}")
        if path in ["/dashboard", "/materials", "/spending"]:
            mpage.screenshot(path=OUT / f"{path.strip('/')}-mobile.png", full_page=True)
    goto(mpage, "/dashboard")
    mpage.get_by_role("button", name="打开导航", exact=True).click()
    assert mpage.get_by_role("navigation", name="主导航").is_visible()
    mpage.get_by_role("link", name="材料中心", exact=False).click()
    mpage.wait_for_url("**/materials")
    assert "-translate-x-full" in (mpage.locator("aside").get_attribute("class") or "")
    ok("mobile navigation drawer")
    mobile.close()
    context.close()
    browser.close()

print(json.dumps({"checks": len(checks), "errors": errors, "warnings": warnings}, ensure_ascii=False, indent=2), flush=True)
if errors:
    raise SystemExit(1)
