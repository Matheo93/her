const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Screenshot initial
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '../.claude/screenshots/eva-t0.png', fullPage: true });
  console.log('✅ Screenshot eva-t0.png saved');

  // Screenshot après 3s
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '../.claude/screenshots/eva-t3.png', fullPage: true });
  console.log('✅ Screenshot eva-t3.png saved');

  await browser.close();
})();
