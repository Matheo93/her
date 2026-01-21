const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Enable console logging
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to EVA...');
  // Use domcontentloaded instead of networkidle2 to avoid timeout
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for page to render
  console.log('Waiting for page to render...');
  await new Promise(r => setTimeout(r, 5000));

  // Screenshot initial
  await page.screenshot({ path: '/home/dev/her/.claude/screenshots/eva-t0.png', fullPage: true });
  console.log('✅ Screenshot 1: eva-t0.png');

  // Wait 3 more seconds
  await new Promise(r => setTimeout(r, 3000));

  // Screenshot after 3s
  await page.screenshot({ path: '/home/dev/her/.claude/screenshots/eva-t3.png', fullPage: true });
  console.log('✅ Screenshot 2: eva-t3.png');

  // Get any WebGL/Canvas info
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      return {
        width: canvas.width,
        height: canvas.height,
        visible: canvas.offsetParent !== null
      };
    }
    return 'No canvas found';
  });
  console.log('Canvas info:', JSON.stringify(canvasInfo));

  await browser.close();
  console.log('✅ Done!');
})();
