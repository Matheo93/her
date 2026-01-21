const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  try {
    // Screenshot initial - use 'load' instead of 'networkidle2' for faster loading
    await page.goto('http://localhost:3000/eva-her', { waitUntil: 'load', timeout: 60000 });
    // Wait for client-side hydration and avatar to render
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: '.claude/screenshots/eva-t0.png', fullPage: true });
    console.log('✅ eva-t0.png saved');

    // Screenshot après 3s (avatar doit bouger - blink, breathe)
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: '.claude/screenshots/eva-t3.png', fullPage: true });
    console.log('✅ eva-t3.png saved');

    console.log('✅ Screenshots completed successfully');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  await browser.close();
})();
