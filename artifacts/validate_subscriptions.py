from pathlib import Path
from datetime import date, timedelta
import json
import re
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5173"
OUT = Path(__file__).parent
errors = []
checks = []


def ok(name):
    checks.append(name)
    print(f"PASS {name}", flush=True)


def attach(page):
    page.on("pageerror", lambda exc: errors.append(f"pageerror: {exc}"))
    page.on("console", lambda msg: errors.append(f"console: {msg.text}") if msg.type == "error" else None)


def goto(page, path):
    page.goto(f"{BASE}{path}", wait_until="networkidle")
    page.wait_for_selector("main")


def no_overflow(page, name):
    width = page.evaluate("document.documentElement.scrollWidth")
    viewport = page.evaluate("innerWidth")
    assert width <= viewport + 1, f"{name}: horizontal overflow {width}>{viewport}"
    ok(f"{name} no horizontal overflow")


def money(text):
    match = re.search(r"[\d,]+(?:\.\d+)?", text)
    assert match, text
    return float(match.group().replace(",", ""))


def summary_values(page):
    cards = page.get_by_label("订阅支出摘要").locator(":scope > div")
    return [money(cards.nth(index).locator("p.numeric").inner_text()) for index in range(3)]


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    attach(page)

    goto(page, "/spending")
    assert page.get_by_role("heading", name="知道每一笔钱为何继续发生", exact=True).is_visible()
    assert page.locator("canvas").count() == 2
    assert page.get_by_text("未来 30 天续费时间轴", exact=True).is_visible()
    assert page.get_by_text("高额记录复核提示", exact=True).first.is_visible()
    assert page.get_by_text("候选，非结论", exact=True).first.is_visible()
    baseline = summary_values(page)
    page.screenshot(path=OUT / "spending-subscriptions-desktop.png", full_page=True)
    ok("record-driven charts, timeline, high-cost and duplicate evidence")

    page.get_by_role("button", name="新增订阅", exact=True).first.click()
    dialog = page.get_by_role("dialog", name="新增订阅记录")
    dialog.get_by_role("button", name="保存订阅", exact=True).click()
    assert dialog.get_by_text("请填写服务名称和分类", exact=True).is_visible()
    dialog.get_by_label("服务名称", exact=True).fill("浏览器测试季付")
    dialog.get_by_label("分类", exact=True).fill("测试服务")
    dialog.get_by_label("每次扣款金额", exact=True).fill("90")
    dialog.locator("label").filter(has_text="续费周期").locator("select").select_option("quarterly")
    renewal = (date.today() + timedelta(days=10)).isoformat()
    dialog.get_by_label("下次续费日期", exact=True).fill(renewal)
    dialog.get_by_label("权益与备注", exact=True).fill("虚构浏览器验收记录")
    dialog.get_by_role("button", name="保存订阅", exact=True).click()
    dialog.wait_for(state="hidden")
    created = summary_values(page)
    assert abs(created[0] - baseline[0] - 30) < 0.01, (baseline, created)
    assert abs(created[1] - baseline[1] - 90) < 0.01, (baseline, created)
    assert abs(created[2] - baseline[2] - 360) < 0.01, (baseline, created)
    ok("manual quarterly creation recalculates monthly, 30-day and annual forecasts")

    listing = page.locator("section[aria-labelledby='subscription-list-title']")
    listing.get_by_role("link", name="浏览器测试季付", exact=True).click()
    page.wait_for_url("**/subscriptions/*")
    page.wait_for_function("window.scrollY === 0")
    assert page.get_by_role("heading", name="浏览器测试季付", exact=True).is_visible()
    assert page.get_by_text("后续扣款安排", exact=True).is_visible()
    detail_url = page.url
    page.screenshot(path=OUT / "subscription-detail-desktop.png", full_page=True)

    page.get_by_role("button", name="编辑", exact=True).click()
    edit_dialog = page.get_by_role("dialog", name="编辑订阅记录")
    edit_dialog.get_by_label("每次扣款金额", exact=True).fill("120")
    edit_dialog.locator("label").filter(has_text="续费周期").locator("select").select_option("yearly")
    edit_dialog.get_by_role("button", name="保存订阅", exact=True).click()
    edit_dialog.wait_for(state="hidden")
    assert page.get_by_text("年付", exact=True).first.is_visible()
    edited = summary_values(page) if page.get_by_label("订阅支出摘要").count() else None
    assert page.get_by_text("¥10", exact=True).first.is_visible()
    ok("subscription detail and edit recalculate schedule and monthly equivalent")

    page.get_by_role("button", name="暂停跟踪", exact=True).click()
    assert page.get_by_text("当前没有未来扣款预测", exact=True).is_visible()
    assert page.get_by_text("¥0", exact=True).first.is_visible()
    page.get_by_role("button", name="恢复跟踪", exact=True).click()
    assert page.get_by_text("当前没有未来扣款预测", exact=True).count() == 0
    ok("pause excludes forecasts and resume restores them without claiming third-party cancellation")

    page.get_by_role("button", name="删除记录", exact=True).click()
    page.get_by_role("dialog", name="删除这条本地订阅记录？").get_by_role("button", name="永久删除", exact=True).click()
    page.wait_for_url("**/spending")
    after_delete = summary_values(page)
    assert abs(after_delete[0] - baseline[0]) < 0.01
    assert page.locator("section[aria-labelledby='subscription-list-title']").get_by_text("浏览器测试季付", exact=True).count() == 0
    ok("local deletion removes the record and restores record-driven totals")

    page.get_by_role("button", name="并不重复", exact=True).first.click()
    page.get_by_text("已标记为不同服务", exact=True).wait_for(state="visible")
    ok("duplicate decision keeps evidence-only language")

    goto(page, "/materials?material=material-keyboard")
    page.locator("label").filter(has_text="材料类型").locator("select").select_option("订阅")
    page.locator("label").filter(has_text="事项类型").locator("select").select_option("subscription")
    page.locator("label").filter(has_text="货币单位").locator("select").select_option("CNY")
    page.get_by_label("订阅分类", exact=True).fill("测试材料服务")
    fields = page.locator("#material-fields-form")
    fields.get_by_label("事项名称", exact=False).fill("浏览器材料订阅")
    fields.locator("input").nth(1).fill("虚构材料商家")
    fields.locator("input").nth(2).fill("36")
    fields.locator("select").select_option("monthly")
    fields.locator("input").nth(6).fill((date.today() + timedelta(days=20)).isoformat())
    page.get_by_role("button", name="确认字段并生成订阅", exact=True).click()
    page.wait_for_url("**/subscriptions/*")
    assert page.get_by_role("heading", name="浏览器材料订阅", exact=True).is_visible()
    assert page.get_by_text("材料字段确认", exact=True).first.is_visible()
    assert page.get_by_text("虚构订阅订单", exact=False).count() == 0
    assert page.url != detail_url
    ok("confirmed material fields create linked subscription and renewal matter")

    mobile = browser.new_context(viewport={"width": 390, "height": 844})
    mpage = mobile.new_page()
    attach(mpage)
    goto(mpage, "/spending")
    no_overflow(mpage, "mobile spending")
    mpage.screenshot(path=OUT / "spending-subscriptions-mobile.png", full_page=True)
    mpage.get_by_role("button", name="新增订阅", exact=True).first.click()
    assert mpage.get_by_role("dialog", name="新增订阅记录").is_visible()
    no_overflow(mpage, "mobile subscription form")
    mpage.get_by_role("button", name="取消", exact=True).click()
    goto(mpage, "/subscriptions/sub-video")
    no_overflow(mpage, "mobile subscription detail")
    mpage.screenshot(path=OUT / "subscription-detail-mobile.png", full_page=True)
    mobile.close()
    context.close()
    browser.close()

print(json.dumps({"checks": len(checks), "errors": errors}, ensure_ascii=False, indent=2), flush=True)
if errors:
    raise SystemExit(1)
