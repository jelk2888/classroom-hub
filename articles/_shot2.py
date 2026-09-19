from playwright.sync_api import sync_playwright
from pathlib import Path

out = Path(r"d:\天门中学\classroom-hub\articles\screenshots")
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("http://127.0.0.1:5174/", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(1500)
    page.fill('input[name="code"]', "DEMO01")
    page.fill('input[name="password"]', "123456")
    page.click('button[type="submit"]')
    page.wait_for_timeout(2500)
    # click student 陈思远
    page.locator("button", has_text="陈思远").first.click()
    page.wait_for_timeout(1500)
    page.screenshot(path=str(out / "10-call-live.png"), full_page=False)
    page.locator("button", has_text="摄像头").first.click()
    page.wait_for_timeout(800)
    page.screenshot(path=str(out / "11-camera-focus.png"), full_page=False)
    # login page fresh context
    page.goto("http://127.0.0.1:5174/", wait_until="domcontentloaded")
    page.evaluate("() => localStorage.clear()")
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(1000)
    page.screenshot(path=str(out / "01-login.png"), full_page=False)
    browser.close()
print("extra shots ok")
