const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Capture console errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Screenshot /eva-her - use domcontentloaded instead of networkidle2
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: '.claude/screenshots/eva-her-t0.png', fullPage: true });

  // Screenshot après 3s
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '.claude/screenshots/eva-her-t3.png', fullPage: true });

  console.log('✅ Screenshots /eva-her saved');
  console.log('Console errors:', errors.length);
  if (errors.length > 0) {
    // Show unique errors only
    const unique = [...new Set(errors)];
    console.log('Unique errors:', unique.slice(0, 10));
  }
  await browser.close();
})();
