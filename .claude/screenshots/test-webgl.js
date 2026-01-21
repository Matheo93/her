const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser with WebGL support...');
  const browser = await puppeteer.launch({
    headless: false, // Use headed mode for WebGL
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--use-gl=swiftshader', // Software WebGL renderer
      '--ignore-gpu-blocklist',
      '--disable-software-rasterizer',
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Log errors
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('WebGL') || text.includes('error') || text.includes('Error')) {
      console.log('BROWSER:', text);
    }
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to EVA...');
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for page to render
  console.log('Waiting 5 seconds for WebGL render...');
  await new Promise(r => setTimeout(r, 5000));

  // Check if WebGL is working
  const webglStatus = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { status: 'no-canvas' };

    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!gl) return { status: 'no-webgl-context' };

    return {
      status: 'ok',
      renderer: gl.getParameter(gl.RENDERER),
      vendor: gl.getParameter(gl.VENDOR),
      canvasSize: { width: canvas.width, height: canvas.height }
    };
  });
  console.log('WebGL Status:', JSON.stringify(webglStatus, null, 2));

  // Screenshot
  await page.screenshot({ path: '/home/dev/her/.claude/screenshots/eva-webgl.png', fullPage: true });
  console.log('✅ Screenshot: eva-webgl.png');

  // Wait 3 more seconds and take another
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/home/dev/her/.claude/screenshots/eva-webgl-t3.png', fullPage: true });
  console.log('✅ Screenshot: eva-webgl-t3.png');

  await browser.close();
  console.log('✅ Done!');
})();
