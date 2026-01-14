const puppeteer = require('puppeteer');

async function testStream() {
    console.log('Testing Eva Stream page...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    const logs = [];
    page.on('console', msg => {
        logs.push('[' + msg.type() + '] ' + msg.text());
    });

    page.on('pageerror', error => {
        logs.push('[ERROR] ' + error.message);
    });

    try {
        await page.goto('https://became-trigger-pipe-bestsellers.trycloudflare.com/eva-stream', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await page.waitForSelector('h1', { timeout: 10000 });

        const title = await page.$eval('h1', el => el.textContent);
        console.log('Title:', title);

        await new Promise(r => setTimeout(r, 3000));

        const status = await page.$eval('p.text-center', el => el.textContent);
        console.log('Status:', status);

        const wsStatus = await page.evaluate(() => {
            const spans = document.querySelectorAll('span.text-xs');
            for (const span of spans) {
                if (span.textContent.includes('WebSocket')) {
                    return span.textContent;
                }
            }
            return 'Not found';
        });
        console.log('WebSocket:', wsStatus);

        await page.screenshot({ path: '/tmp/stream_test.png', fullPage: true });
        console.log('Screenshot: /tmp/stream_test.png');

        const inputExists = await page.$('input[type="text"]');
        if (inputExists) {
            const isDisabled = await page.$eval('input[type="text"]', el => el.disabled);
            console.log('Input disabled:', isDisabled);

            if (!isDisabled) {
                await page.type('input[type="text"]', 'salut');
                await page.click('button');
                console.log('Message sent, waiting for response...');
                await new Promise(r => setTimeout(r, 8000));
            }
        }

        await page.screenshot({ path: '/tmp/stream_test_after.png', fullPage: true });
        console.log('Screenshot after: /tmp/stream_test_after.png');

        console.log('\nConsole logs:');
        logs.slice(-10).forEach(l => console.log(' ', l));

    } catch (error) {
        console.error('Test error:', error.message);
    } finally {
        await browser.close();
    }
}

testStream();
