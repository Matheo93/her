const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Screenshot initial
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '../.claude/screenshots/eva-initial.png', fullPage: true });
  console.log('✅ eva-initial.png');

  // Screenshot mobile
  await page.setViewport({ width: 375, height: 667 }); // iPhone SE
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '../.claude/screenshots/eva-mobile.png', fullPage: true });
  console.log('✅ eva-mobile.png');

  await browser.close();
  console.log('✅ UX screenshots completed');
})();
