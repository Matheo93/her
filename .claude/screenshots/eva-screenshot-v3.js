const puppeteer = require('puppeteer');

(async () => {
    console.log('Taking screenshot of EVA avatar with WebGL support...');
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--enable-webgl',
            '--use-gl=swiftshader',
            '--enable-accelerated-2d-canvas',
            '--disable-infobars',
            '--window-size=1280,800'
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Enable console logging from the page
    page.on('console', msg => {
        console.log('[PAGE]', msg.type(), msg.text());
    });
    page.on('pageerror', error => {
        console.log('[PAGE ERROR]', error.message);
    });

    page.setDefaultNavigationTimeout(60000);

    try {
        console.log('Navigating to http://localhost:3000/eva-her ...');
        const response = await page.goto('http://localhost:3000/eva-her', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        console.log('Response status:', response.status());

        // Wait for Three.js canvas to be present
        console.log('Waiting for canvas element...');
        try {
            await page.waitForSelector('canvas', { timeout: 15000 });
            console.log('Canvas element found!');
        } catch (e) {
            console.log('Canvas element NOT found after 15s');
        }

        // Wait for 3D to render
        console.log('Waiting 10 seconds for 3D avatar to render...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Check WebGL support
        const webglSupport = await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return !!gl;
        });
        console.log('WebGL supported:', webglSupport);

        // Check if Three.js canvas exists
        const canvasExists = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
                return {
                    exists: true,
                    width: canvas.width,
                    height: canvas.height,
                    style: canvas.style.cssText
                };
            }
            return { exists: false };
        });
        console.log('Canvas info:', canvasExists);

        await page.screenshot({
            path: '/workspace/music-music-ai-training-api/.claude/screenshots/eva-avatar-v3.png',
            fullPage: false
        });
        console.log('Screenshot saved: eva-avatar-v3.png');
    } catch (error) {
        console.error('Error:', error.message);
        await page.screenshot({
            path: '/workspace/music-music-ai-training-api/.claude/screenshots/eva-avatar-error-v3.png'
        });
    }

    await browser.close();
    console.log('Done!');
})();
