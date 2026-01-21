const puppeteer = require('puppeteer');

(async () => {
    console.log('Taking screenshot of EVA avatar with HEADED browser...');
    const browser = await puppeteer.launch({
        headless: false,  // HEADED mode for WebGL
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--start-maximized',
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Enable console logging
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('[PAGE ERROR]', msg.text());
        }
    });

    page.setDefaultNavigationTimeout(60000);

    try {
        console.log('Navigating to http://localhost:3000/eva-her ...');
        await page.goto('http://localhost:3000/eva-her', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Wait for canvas
        console.log('Waiting for canvas...');
        await page.waitForSelector('canvas', { timeout: 20000 });
        console.log('Canvas found!');

        // Wait for 3D to fully render
        console.log('Waiting 8 seconds for 3D render...');
        await new Promise(resolve => setTimeout(resolve, 8000));

        // Check canvas
        const canvasInfo = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
                const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
                return {
                    exists: true,
                    width: canvas.width,
                    height: canvas.height,
                    webglContext: !!gl,
                    renderer: gl ? gl.getParameter(gl.RENDERER) : 'none'
                };
            }
            return { exists: false };
        });
        console.log('Canvas info:', canvasInfo);

        await page.screenshot({
            path: '/workspace/music-music-ai-training-api/.claude/screenshots/eva-avatar-headed.png',
            fullPage: false
        });
        console.log('Screenshot saved: eva-avatar-headed.png');
    } catch (error) {
        console.error('Error:', error.message);
    }

    await browser.close();
    console.log('Done!');
})();
