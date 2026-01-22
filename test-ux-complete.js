const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Capture console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // 1. Desktop initial state
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: '.claude/screenshots/eva-initial.png', fullPage: true });
  console.log('eva-initial.png');

  // 2. Mobile view
  await page.setViewport({ width: 375, height: 667 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '.claude/screenshots/eva-mobile.png', fullPage: true });
  console.log('eva-mobile.png');

  // 3. Main page (/)
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '.claude/screenshots/eva-home.png', fullPage: true });
  console.log('eva-home.png');

  console.log('Total console errors:', errors.length);
  await browser.close();
})();
