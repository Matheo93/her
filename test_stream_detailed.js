const puppeteer = require('puppeteer');

async function testStreamDetailed() {
    console.log('Testing Eva Stream page with detailed logging...\n');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    const logs = [];
    page.on('console', msg => {
        const text = '[' + msg.type() + '] ' + msg.text();
        logs.push(text);
        console.log('  CONSOLE:', text);
    });

    page.on('pageerror', error => {
        const text = '[ERROR] ' + error.message;
        logs.push(text);
        console.log('  PAGE ERROR:', text);
    });

    try {
        console.log('1. Loading page...');
        await page.goto('https://became-trigger-pipe-bestsellers.trycloudflare.com/eva-stream', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await page.waitForSelector('h1', { timeout: 10000 });
        console.log('   Page loaded.');

        // Wait for WebSocket connection
        console.log('2. Waiting for WebSocket...');
        await new Promise(r => setTimeout(r, 3000));

        const wsStatus = await page.evaluate(() => {
            const spans = document.querySelectorAll('span.text-xs');
            for (const span of spans) {
                if (span.textContent.includes('WebSocket')) {
                    return span.textContent;
                }
            }
            return 'Not found';
        });
        console.log('   WebSocket status:', wsStatus);

        const status = await page.$eval('p.text-center', el => el.textContent);
        console.log('   Page status:', status);

        // Check if input is enabled
        const inputDisabled = await page.$eval('input[type="text"]', el => el.disabled);
        console.log('   Input disabled:', inputDisabled);

        if (inputDisabled) {
            console.log('   ERROR: Input is disabled - WebSocket not connected properly');
            await page.screenshot({ path: '/tmp/stream_error.png', fullPage: true });
            return;
        }

        // Type message
        console.log('3. Typing message "salut"...');
        await page.type('input[type="text"]', 'salut');

        // Click send button
        console.log('4. Clicking send button...');
        await page.click('button');

        // Wait and monitor
        console.log('5. Waiting for response and lip-sync...');

        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 1000));

            const currentStatus = await page.$eval('p.text-center', el => el.textContent);
            const messageCount = await page.$$eval('.rounded-2xl', els => els.length);

            console.log(`   [${i+1}s] Status: ${currentStatus}, Messages: ${messageCount}`);

            if (i === 5 || i === 10 || i === 15) {
                await page.screenshot({ path: `/tmp/stream_t${i}.png`, fullPage: true });
                console.log(`   Screenshot saved: /tmp/stream_t${i}.png`);
            }
        }

        await page.screenshot({ path: '/tmp/stream_final.png', fullPage: true });
        console.log('\n6. Final screenshot: /tmp/stream_final.png');

    } catch (error) {
        console.error('\nTest error:', error.message);
        await page.screenshot({ path: '/tmp/stream_error.png', fullPage: true });
    } finally {
        await browser.close();
    }

    console.log('\n=== Console logs summary ===');
    logs.forEach(l => console.log(' ', l));
}

testStreamDetailed();
