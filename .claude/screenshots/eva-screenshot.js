const puppeteer = require('puppeteer');

(async () => {
    console.log('Taking screenshot of EVA avatar...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        await page.goto('http://localhost:3000/eva-her', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Wait for 3D avatar to load
        await new Promise(resolve => setTimeout(resolve, 5000));

        await page.screenshot({
            path: '/workspace/music-music-ai-training-api/.claude/screenshots/eva-avatar.png',
            fullPage: false
        });
        console.log('Screenshot saved: eva-avatar.png');
    } catch (error) {
        console.error('Error:', error.message);
        await page.screenshot({
            path: '/workspace/music-music-ai-training-api/.claude/screenshots/eva-avatar-error.png'
        });
    }

    await browser.close();
    console.log('Done!');
})();
