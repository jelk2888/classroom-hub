import sys
from pathlib import Path

sys.path.insert(0, r"C:\Users\DELL\.claude\skills\webapp-testing\scripts")
try:
    from playwright_env import apply_playwright_browsers_path

    apply_playwright_browsers_path()
except Exception as e:
    print("playwright_env:", e)

from playwright.sync_api import sync_playwright

out = Path(r"d:\天门中学\classroom-hub\articles\screenshots")
out.mkdir(parents=True, exist_ok=True)
base = "http://127.0.0.1:5174/"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.goto(base, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(2500)
    page.screenshot(path=str(out / "01-login.png"), full_page=False)
    print("login ok", page.title(), page.url)

    # class login DEMO01 / 123456
    page.fill('input[name="code"]', "DEMO01")
    page.fill('input[name="password"]', "123456")
    page.click('button[type="submit"]')
    page.wait_for_timeout(3500)
    page.screenshot(path=str(out / "02-workspace.png"), full_page=False)
    print("workspace", page.url)
    print(page.evaluate("() => document.body.innerText.slice(0,600)"))

    # tabs by text
    tabs = [
        ("远程叫人", "03-calling.png"),
        ("摄像头喊话", "04-camera.png"),
        ("纪律管理", "05-discipline.png"),
        ("作业布置", "06-homework.png"),
        ("随机点名", "07-picker.png"),
        ("计时工具", "08-timer.png"),
        ("设置名单", "09-settings.png"),
    ]
    for label, fname in tabs:
        btn = page.locator("button", has_text=label).first
        if btn.count():
            btn.click()
            page.wait_for_timeout(1200)
            page.screenshot(path=str(out / fname), full_page=False)
            print("shot", fname)
        else:
            print("missing tab", label)

    # try multi-select / call preview if possible
    call_btn = page.locator("button", has_text="远程叫人").first
    if call_btn.count():
        call_btn.click()
        page.wait_for_timeout(800)
        # click first student card if any
        cards = page.locator(".grid button, .stu, .student, .card")
        print("cards", cards.count())
        # generic: click something that looks like a name
        names = page.locator("button").filter(has_text="同学")
        print("name-ish", names.count())
        page.screenshot(path=str(out / "03b-calling-detail.png"), full_page=False)

    browser.close()
print("done")
