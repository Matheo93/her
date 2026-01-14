const puppeteer = require('puppeteer');

async function testPages() {
    console.log('Starting Puppeteer tests...');

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const results = {
        ditto: { status: 'pending', errors: [] },
        faster: { status: 'pending', errors: [] }
    };

    try {
        // Test Ditto page
        console.log('\n=== Testing Eva-Ditto Page ===');
        const dittoPage = await browser.newPage();

        dittoPage.on('console', msg => {
            if (msg.type() === 'error') {
                results.ditto.errors.push(msg.text());
            }
        });

        dittoPage.on('pageerror', error => {
            results.ditto.errors.push(error.message);
        });

        await dittoPage.goto('http://localhost:3000/eva-ditto', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Check page content
        const dittoTitle = await dittoPage.$eval('h1', el => el.textContent);
        console.log('Ditto page title:', dittoTitle);

        // Check if source image is loaded
        const dittoImage = await dittoPage.$('img[alt="Eva"]');
        if (dittoImage) {
            console.log('Ditto: Eva image found');
            results.ditto.status = 'loaded';
        } else {
            results.ditto.status = 'error';
            results.ditto.errors.push('Eva image not found');
        }

        // Take screenshot
        await dittoPage.screenshot({ path: '/tmp/ditto_page.png', fullPage: true });
        console.log('Ditto screenshot saved to /tmp/ditto_page.png');

        // Check status indicator
        const dittoStatus = await dittoPage.$eval('span', el => el.textContent);
        console.log('Ditto status:', dittoStatus);

        await dittoPage.close();

        // Test FasterLivePortrait page
        console.log('\n=== Testing Eva-Faster Page ===');
        const fasterPage = await browser.newPage();

        fasterPage.on('console', msg => {
            if (msg.type() === 'error') {
                results.faster.errors.push(msg.text());
            }
        });

        fasterPage.on('pageerror', error => {
            results.faster.errors.push(error.message);
        });

        await fasterPage.goto('http://localhost:3000/eva-faster', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Check page content
        const fasterTitle = await fasterPage.$eval('h1', el => el.textContent);
        console.log('Faster page title:', fasterTitle);

        // Check if source image is loaded
        const fasterImage = await fasterPage.$('img[alt="Eva"]');
        if (fasterImage) {
            console.log('Faster: Eva image found');
            results.faster.status = 'loaded';
        } else {
            results.faster.status = 'error';
            results.faster.errors.push('Eva image not found');
        }

        // Take screenshot
        await fasterPage.screenshot({ path: '/tmp/faster_page.png', fullPage: true });
        console.log('Faster screenshot saved to /tmp/faster_page.png');

        // Check JoyVASA status
        const statusElements = await fasterPage.$$('span');
        for (const el of statusElements) {
            const text = await el.evaluate(e => e.textContent);
            if (text.includes('JoyVASA')) {
                console.log('JoyVASA status:', text);
            }
        }

        await fasterPage.close();

    } catch (error) {
        console.error('Test error:', error.message);
    } finally {
        await browser.close();
    }

    // Summary
    console.log('\n=== Test Summary ===');
    console.log('Ditto page:', results.ditto.status);
    if (results.ditto.errors.length > 0) {
        console.log('  Errors:', results.ditto.errors.slice(0, 3).join(', '));
    }
    console.log('Faster page:', results.faster.status);
    if (results.faster.errors.length > 0) {
        console.log('  Errors:', results.faster.errors.slice(0, 3).join(', '));
    }

    return results;
}

testPages()
    .then(results => {
        console.log('\nTest completed.');
        process.exit(results.ditto.status === 'loaded' && results.faster.status === 'loaded' ? 0 : 1);
    })
    .catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
