const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser with software WebGL...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-unsafe-swiftshader', // Enable software WebGL
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--enable-webgl-draft-extensions',
      '--enable-webgl2-compute-context',
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Log errors
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('WebGL') || text.includes('Error') || text.includes('THREE')) {
      console.log('BROWSER:', text.substring(0, 200));
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

    try {
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2') || canvas.getContext('experimental-webgl');
      if (!gl) return { status: 'no-webgl-context' };

      return {
        status: 'ok',
        renderer: gl.getParameter(gl.RENDERER),
        vendor: gl.getParameter(gl.VENDOR),
        canvasSize: { width: canvas.width, height: canvas.height }
      };
    } catch (e) {
      return { status: 'error', message: e.message };
    }
  });
  console.log('WebGL Status:', JSON.stringify(webglStatus, null, 2));

  // Screenshot
  await page.screenshot({ path: '/home/dev/her/.claude/screenshots/eva-swiftshader.png', fullPage: true });
  console.log('✅ Screenshot: eva-swiftshader.png');

  // Wait 3 more seconds and take another
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '/home/dev/her/.claude/screenshots/eva-swiftshader-t3.png', fullPage: true });
  console.log('✅ Screenshot: eva-swiftshader-t3.png');

  await browser.close();
  console.log('✅ Done!');
})();
