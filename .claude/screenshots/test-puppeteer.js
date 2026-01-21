const puppeteer = require('puppeteer');

(async () => {
    console.log('Testing Puppeteer...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('https://example.com');
    await page.screenshot({ path: '/workspace/music-music-ai-training-api/.claude/screenshots/test-puppeteer.png' });
    console.log('Screenshot saved: test-puppeteer.png');
    await browser.close();
    console.log('Puppeteer test SUCCESS!');
})();
