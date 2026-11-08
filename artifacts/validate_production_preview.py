import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.environ.get("LG_BASE", "http://127.0.0.1:4173").rstrip("/")
ROOT = Path(__file__).resolve().parent
checks = []
errors = []
console_errors = []
writes = []


def record(name, ok, detail=""):
    checks.append({"name": name, "ok": bool(ok), "detail": detail})
    print(("PASS " if ok else "FAIL ") + name + (f" | {detail}" if detail else ""))
    if not ok:
        errors.append(name)


def state(page):
    return page.evaluate("""() => {
      const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
      if (raw) return JSON.parse(raw)
      const pinia = document.querySelector('#app')?.__vue_app__?.config?.globalProperties?.$pinia
      return pinia ? JSON.parse(JSON.stringify(pinia.state.value.demo)) : null
    }""")


def goto(page, path):
    page.goto(BASE + path, wait_until="networkidle")
    page.wait_for_timeout(400)


def no_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))
    page.on("request", lambda r: writes.append(f"{r.method} {r.url}") if r.method not in ("GET", "HEAD", "OPTIONS") else None)

    goto(page, "/")
    record("P1 首页直接访问", page.url.endswith("/welcome") and "知悉 LifeGuard" in page.title() and page.get_by_text("重要的期限，").first.is_visible(), page.title())

    page.locator("a,button").filter(has_text=re.compile("进入演示|免费体验")).first.click()
    page.wait_for_url("**/dashboard")
    page.wait_for_load_state("networkidle")
    s = state(page)
    record("P2 进入演示模式", s is not None and len(s["matters"]) > 0, f"matters={len(s['matters'])}")

    goto(page, "/welcome")
    page.get_by_role("button", name=re.compile("一键加载演示案例")).click()
    dialog = page.get_by_role("dialog")
    if dialog.count():
        dialog.get_by_role("button", name=re.compile("替换并加载")).click()
    page.get_by_text("竞赛演示已加载").first.wait_for()
    s = state(page)
    active = [m for m in s["matters"] if m["status"] == "active"]
    live = all(m.get("assessment", {}).get("score", 0) > 0 and m["assessment"].get("ruleVersion") for m in active)
    rules = all(pl.get("generationMode") == "rule" for pl in s["actions"])
    record("P3 一键加载演示数据（实时重算）", len(active) >= 3 and live and rules, f"active={len(active)} ruleVersion+generationMode=rule")

    goto(page, "/materials")
    page.locator("input[type=file]").set_input_files(str(ROOT / "acceptance-order-clear.png"))
    page.wait_for_function("""() => {
      const raw = localStorage.getItem('lifeguard.demo.workspace.v1')
      if (!raw) return false
      const m = JSON.parse(raw).materials.find((x) => x.name === 'acceptance-order-clear.png')
      return m && m.status === 'awaiting_confirmation'
    }""", timeout=240000)
    s = state(page)
    mat = next(m for m in s["materials"] if m["name"] == "acceptance-order-clear.png")
    fields = {f["key"]: f for f in mat["fields"]}
    record("P4 上传测试材料", mat["status"] == "awaiting_confirmation", f"engine={mat.get('engine')}")
    ok5 = (
        "无线降噪耳机" in fields["title"]["value"]
        and fields["amount"]["value"].startswith("899")
        and all(f["status"] != "confirmed" for f in mat["fields"])
        and page.get_by_text("依据：").first.is_visible()
    )
    record("P5 查看识别结果（候选未确认+依据）", ok5, f"title={fields['title']['value']} amount={fields['amount']['value']}")

    page.get_by_role("button", name="确认字段并生成事项").click()
    page.wait_for_timeout(600)
    s = state(page)
    matter = next(m for m in s["matters"] if m["title"] == "无线降噪耳机" or "耳机" in m["title"])
    goto(page, f"/matters/{matter['id']}")
    articles = page.locator("section[aria-labelledby='assessment-title'] article").count()
    score = matter.get("assessment", {}).get("score", 0)
    record("P6 查看风险分析", articles == 5 and score > 0 and page.get_by_text("为什么是这个优先级").first.is_visible(), f"score={score} factors={articles}")

    plan = page.locator("section[aria-labelledby='detail-plan-title']")
    before = plan.locator("input[type=checkbox]").count()
    plan.locator("label").first.click()
    page.wait_for_timeout(400)
    checked = plan.locator("input[type=checkbox]:checked").count()
    page.get_by_role("button", name="记录处理结果").click()
    modal = page.get_by_role("dialog")
    modal.locator("label").filter(has_text="处理结果").locator("input").fill("已完成退货申请")
    modal.get_by_role("button", name="保存完成记录").click()
    modal.wait_for(state="detached")
    page.wait_for_timeout(400)
    s = state(page)
    done = next(m for m in s["matters"] if m["id"] == matter["id"])
    history_ok = any(h.get("matterId") == matter["id"] and h.get("title") == "事项已完成" for h in s.get("histories", []))
    record("P7 使用行动建议并闭环", before >= 3 and checked == 1 and done["status"] == "completed" and history_ok, f"steps={before} completed+history")

    goto(page, "/radar")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(400)
    deep_ok = page.url.endswith("/radar") and page.get_by_role("heading", name="看见接下来要发生的事").is_visible()
    goto(page, "/definitely-missing-route")
    missing_ok = page.get_by_text("这个页面不存在").is_visible()
    record("P8 深路由刷新与未知路径", deep_ok and missing_ok, "refresh /radar 保持；未知路径显示站内 404")

    external_writes = [w for w in writes if not w.split(" ", 1)[1].startswith(BASE)]
    s = state(page)
    no_preview = all(not m.get("previewUrl") for m in s["materials"])
    record("P9 隐私与网络边界", not writes and no_preview, f"write_requests={len(writes)} previewUrl_persisted={not no_preview}")

    mobile = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    mpage = mobile.new_page()
    mpage.on("pageerror", lambda e: console_errors.append(str(e)))
    mobile_ok = True
    for path in ("/welcome", "/dashboard", "/spending", "/materials"):
        goto(mpage, path)
        mobile_ok = mobile_ok and no_overflow(mpage)
    goto(mpage, "/welcome")
    mobile_ok = mobile_ok and mpage.get_by_role("button", name=re.compile("一键加载演示案例")).is_visible()
    record("P10 手机浏览器访问", mobile_ok, "390x844 四路由无溢出+演示入口可见")

    browser.close()

real_console_errors = [e for e in console_errors if "Parameter not found" not in e]
print(json.dumps({"base": BASE, "checks": len(checks), "failed": errors, "console_errors": real_console_errors, "write_requests": writes}, ensure_ascii=False, indent=2))
sys.exit(1 if errors or real_console_errors else 0)