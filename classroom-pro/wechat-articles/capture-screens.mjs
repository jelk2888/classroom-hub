import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, 'images');
fs.mkdirSync(out, { recursive: true });

const BASE = 'http://test.zjjdg.top:5666';

async function shot(page, name) {
  const p = path.join(out, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log('saved', name);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // 登录页
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await shot(page, '01-login');

  // 班级登录 DEMO01 / 123456
  const inputs = page.locator('input');
  const count = await inputs.count();
  // 尝试找班级号/密码
  await page.getByPlaceholder(/班级|账号|班级号/i).first().fill('DEMO01').catch(async () => {
    if (count >= 1) await inputs.nth(0).fill('DEMO01');
  });
  await page.getByPlaceholder(/密码/i).first().fill('123456').catch(async () => {
    if (count >= 2) await inputs.nth(1).fill('123456');
  });
  await page.getByRole('button', { name: /登录|进入/ }).first().click().catch(async () => {
    await page.locator('button').first().click();
  });
  await page.waitForTimeout(2500);
  await shot(page, '02-workspace');

  // 侧栏功能逐一点击截图
  const tabs = [
    ['呼叫', '03-call'],
    ['叫人', '03-call'],
    ['远程叫人', '03-call'],
    ['纪律', '04-discipline'],
    ['作业', '05-homework'],
    ['点名', '06-picker'],
    ['计时', '07-timer'],
    ['公告', '08-announce'],
    ['值班', '09-duty'],
    ['积分', '10-points'],
    ['摄像头', '11-camera'],
    ['看班', '11-camera'],
    ['远程看班', '11-camera'],
    ['喊话', '12-shout'],
    ['宠物', '13-pet'],
  ];

  const clicked = new Set();
  for (const [label, file] of tabs) {
    if (clicked.has(file)) continue;
    const el = page.getByText(label, { exact: false }).first();
    if (await el.count()) {
      try {
        await el.click({ timeout: 2000 });
        await page.waitForTimeout(900);
        await shot(page, file);
        clicked.add(file);
      } catch {}
    }
  }

  // 手机视口再截一张登录/工作台
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '14-login-mobile');

  await page.getByPlaceholder(/班级|账号|班级号/i).first().fill('DEMO01').catch(async () => {
    const ins = page.locator('input');
    if (await ins.count()) await ins.nth(0).fill('DEMO01');
  });
  await page.getByPlaceholder(/密码/i).first().fill('123456').catch(async () => {
    const ins = page.locator('input');
    if ((await ins.count()) >= 2) await ins.nth(1).fill('123456');
  });
  await page.getByRole('button', { name: /登录|进入/ }).first().click().catch(async () => {
    await page.locator('button').first().click();
  });
  await page.waitForTimeout(2000);
  await shot(page, '15-workspace-mobile');

  // 看板模式
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE + '/?mode=board', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '16-board');

  await browser.close();
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
