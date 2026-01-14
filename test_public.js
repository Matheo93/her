const puppeteer = require('puppeteer');

const BASE_URL = 'https://became-trigger-pipe-bestsellers.trycloudflare.com';

async function testPublicPages() {
    console.log('Testing public URLs via Cloudflare...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        // Test Ditto page
        console.log('=== Testing Eva-Ditto ===');
        const dittoPage = await browser.newPage();

        dittoPage.on('pageerror', error => {
            console.log('  Page error:', error.message);
        });

        await dittoPage.goto(`${BASE_URL}/eva-ditto`, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        const dittoTitle = await dittoPage.$eval('h1', el => el.textContent);
        console.log('  Title:', dittoTitle);

        const dittoImage = await dittoPage.$('img[alt="Eva"]');
        console.log('  Eva image:', dittoImage ? 'Found' : 'NOT FOUND');

        await dittoPage.screenshot({ path: '/tmp/ditto_public.png', fullPage: true });
        console.log('  Screenshot: /tmp/ditto_public.png');

        await dittoPage.close();

        // Test Faster page
        console.log('\n=== Testing Eva-Faster ===');
        const fasterPage = await browser.newPage();

        fasterPage.on('pageerror', error => {
            console.log('  Page error:', error.message);
        });

        await fasterPage.goto(`${BASE_URL}/eva-faster`, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        const fasterTitle = await fasterPage.$eval('h1', el => el.textContent);
        console.log('  Title:', fasterTitle);

        const fasterImage = await fasterPage.$('img[alt="Eva"]');
        console.log('  Eva image:', fasterImage ? 'Found' : 'NOT FOUND');

        await fasterPage.screenshot({ path: '/tmp/faster_public.png', fullPage: true });
        console.log('  Screenshot: /tmp/faster_public.png');

        await fasterPage.close();

        console.log('\n=== TEST PASSED ===');
        console.log(`Ditto:  ${BASE_URL}/eva-ditto`);
        console.log(`Faster: ${BASE_URL}/eva-faster`);

    } catch (error) {
        console.error('Test failed:', error.message);
    } finally {
        await browser.close();
    }
}

testPublicPages();
