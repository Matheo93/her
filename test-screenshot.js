const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  console.log('Navigating to EVA...');
  try {
    await page.goto('http://localhost:3000/eva-her', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch(e) {
    console.log('Navigation warning:', e.message);
  }

  await new Promise(r => setTimeout(r, 3000));

  console.log('Screenshot t0...');
  await page.screenshot({ path: '.claude/screenshots/eva-t0.png', fullPage: true });

  await new Promise(r => setTimeout(r, 3000));
  console.log('Screenshot t3...');
  await page.screenshot({ path: '.claude/screenshots/eva-t3.png', fullPage: true });

  // Initial state
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '.claude/screenshots/eva-initial.png', fullPage: true });
  console.log('Screenshot initial saved');

  // Mobile viewport
  await page.setViewport({ width: 375, height: 667 });
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '.claude/screenshots/eva-mobile.png', fullPage: true });
  console.log('Screenshot mobile saved');

  console.log('✅ All screenshots saved!');
  await browser.close();
})();
