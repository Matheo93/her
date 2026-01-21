const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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
  
  console.log('Screenshot 1...');
  await page.screenshot({ path: '.claude/screenshots/eva-test-1.png', fullPage: true });
  
  await new Promise(r => setTimeout(r, 2000));
  console.log('Screenshot 2...');
  await page.screenshot({ path: '.claude/screenshots/eva-test-2.png', fullPage: true });
  
  console.log('✅ Screenshots saved!');
  await browser.close();
})();
