from pathlib import Path
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


def score(page):
    return int(page.locator("section[aria-labelledby='assessment-title'] .numeric.text-5xl").inner_text())


def no_overflow(page, name):
    width = page.evaluate("document.documentElement.scrollWidth")
    viewport = page.evaluate("innerWidth")
    assert width <= viewport + 1, f"{name}: horizontal overflow {width}>{viewport}"
    ok(f"{name} no horizontal overflow")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    attach(page)

    goto(page, "/dashboard")
    assert page.get_by_text("按五维优先级排序", exact=False).is_visible()
    assert page.get_by_text("分 ·", exact=False).first.is_visible()
    no_overflow(page, "decision dashboard desktop")
    ok("dashboard displays explainable priority scores")

    goto(page, "/matters/matter-headphones")
    assert page.locator("section[aria-labelledby='assessment-title'] article").count() == 5
    assert page.get_by_role("heading", name="为什么是这个优先级", exact=True).is_visible()
    assert page.get_by_role("heading", name="当前情况分析", exact=True).is_visible()
    assert page.get_by_role("heading", name="主要风险", exact=True).first.is_visible()
    assert page.get_by_role("heading", name="历史变化", exact=True).is_visible()
    assert page.get_by_text("本方案不构成法律意见或平台结果保证", exact=False).is_visible()
    ok("detail shows five factors, analysis, risks, history and legal boundary")

    migrated = page.locator("label").filter(has_text="整理订单与商品证据").first
    assert migrated.locator("input[type='checkbox']").is_checked()
    verify = page.locator("label").filter(has_text="关键信息与适用规则").first
    verify.click()
    assert verify.locator("input[type='checkbox']").is_checked()
    ok("legacy and newly completed steps are checked")

    before = score(page)
    page.get_by_role("button", name="编辑并重算", exact=True).click()
    page.get_by_label("金额（可留空待核实）", exact=True).fill("1399")
    page.locator("#edit-matter-form select").nth(1).select_option("5")
    page.get_by_role("button", name="保存并重新计算", exact=True).click()
    after = score(page)
    assert after != before
    assert verify.locator("input[type='checkbox']").is_checked()
    assert migrated.locator("input[type='checkbox']").is_checked()
    assert page.get_by_text("事项信息与决策方案已更新", exact=True).is_visible()
    assert page.get_by_text("1299", exact=True).first.is_visible()
    assert page.get_by_text("1399", exact=True).first.is_visible()
    ok("edit recomputes score, preserves progress and records field history")
    page.screenshot(path=OUT / "decision-detail-desktop.png", full_page=True)
    no_overflow(page, "decision detail desktop")

    page.evaluate("""() => {
      const key = 'lifeguard.demo.workspace.v1'
      const data = JSON.parse(localStorage.getItem(key))
      const matter = data.matters.find((item) => item.id === 'matter-headphones')
      matter.provenance.dueDate = { source: 'ocr', confirmed: false, note: '浏览器验收构造的待核实 OCR 日期' }
      localStorage.setItem(key, JSON.stringify(data))
    }""")
    page.reload(wait_until="networkidle")
    pending_score = score(page)
    assert page.get_by_text("OCR 识别", exact=False).first.is_visible()
    page.get_by_role("button", name="确认此信息", exact=True).click()
    assert score(page) > pending_score
    assert page.get_by_text("信息已确认", exact=True).is_visible()
    ok("OCR fact confirmation updates source, score and recommendation")

    page.get_by_role("button", name="标记完成", exact=True).click()
    page.get_by_label("处理结果", exact=True).fill("已完成决策引擎验收")
    page.get_by_role("button", name="保存完成记录", exact=True).click()
    assert score(page) == 0
    page.get_by_role("button", name="恢复待处理", exact=True).click()
    assert score(page) > 0
    assert page.get_by_text("恢复待处理并重新评估", exact=True).is_visible()
    ok("completion and restore recalculate priority and retain history")

    goto(page, "/actions")
    assert page.get_by_text("按五维优先级排列", exact=False).is_visible()
    plan_scores = []
    for text in page.locator("aside[aria-label='行动清单列表'] button").all_inner_texts():
        match = re.search(r"(\d+) 分", text)
        if match:
            plan_scores.append(int(match.group(1)))
    assert plan_scores == sorted(plan_scores, reverse=True), plan_scores
    assert page.get_by_text("建议完成：", exact=False).first.is_visible()
    no_overflow(page, "actions desktop")
    ok("action plans are sorted by score and show completion guidance")

    goto(page, "/dashboard")
    page.get_by_role("button", name="新建生活事项", exact=True).click()
    page.locator("#matter-title").fill("无期限虚构验收事项")
    page.locator("#matter-merchant").fill("虚构验收机构")
    page.locator("#matter-action").fill("先补充并核实材料")
    page.get_by_role("button", name="创建并生成行动清单", exact=True).click()
    page.wait_for_url("**/matters/*")
    assert page.get_by_role("heading", name="无期限虚构验收事项", exact=True).is_visible()
    assert page.get_by_text("暂不生成", exact=True).is_visible()
    assert page.get_by_text("时间因素计 0 分", exact=False).is_visible()
    assert page.get_by_text("损失因素计 0 分", exact=False).is_visible()
    ok("manual matter allows missing facts without inventing dates or losses")

    mobile = browser.new_context(viewport={"width": 390, "height": 844})
    mpage = mobile.new_page()
    attach(mpage)
    for path in ["/dashboard", "/actions", "/matters/matter-headphones"]:
        goto(mpage, path)
        no_overflow(mpage, f"decision mobile {path}")
    mpage.screenshot(path=OUT / "decision-detail-mobile.png", full_page=True)
    mobile.close()
    context.close()
    browser.close()

print(json.dumps({"checks": len(checks), "errors": errors}, ensure_ascii=False, indent=2), flush=True)
if errors:
    raise SystemExit(1)
