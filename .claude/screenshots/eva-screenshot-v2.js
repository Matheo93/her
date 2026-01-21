const puppeteer = require('puppeteer');

(async () => {
    console.log('Taking screenshot of EVA avatar...');
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-gpu'
        ]
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Set longer timeout and disable some JS if needed
    page.setDefaultNavigationTimeout(60000);

    try {
        console.log('Navigating to http://localhost:3000/eva-her ...');
        const response = await page.goto('http://localhost:3000/eva-her', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('Response status:', response.status());

        // Wait some time for React to hydrate and 3D to load
        console.log('Waiting 8 seconds for 3D avatar to load...');
        await new Promise(resolve => setTimeout(resolve, 8000));

        await page.screenshot({
            path: '/workspace/music-music-ai-training-api/.claude/screenshots/eva-avatar.png',
            fullPage: false
        });
        console.log('Screenshot saved: eva-avatar.png');
    } catch (error) {
        console.error('Error:', error.message);
        // Take error screenshot anyway
        try {
            await page.screenshot({
                path: '/workspace/music-music-ai-training-api/.claude/screenshots/eva-avatar-error.png'
            });
            console.log('Error screenshot saved');
        } catch (e) {}
    }

    await browser.close();
    console.log('Done!');
})();
