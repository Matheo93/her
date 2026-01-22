#!/usr/bin/env node
/**
 * EVA Screenshot Tool
 * Usage: node screenshot.js [name] [url]
 *
 * Takes a screenshot and saves it to .claude/screenshots/
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '..', '.claude', 'screenshots');
const DEFAULT_URL = 'http://localhost:3000';

async function takeScreenshot(name = 'screenshot', url = DEFAULT_URL) {
    // Ensure screenshots directory exists
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${name}-${timestamp}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);

    console.log(`📸 Taking screenshot: ${filename}`);
    console.log(`   URL: ${url}`);

    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });

        const page = await context.newPage();

        // Collect console messages
        const consoleMessages = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleMessages.push(`[ERROR] ${msg.text()}`);
            }
        });

        // Navigate
        console.log('   Navigating...');
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 30000
        });

        // Wait a bit for animations
        await page.waitForTimeout(2000);

        // Take screenshot
        await page.screenshot({
            path: filepath,
            fullPage: false
        });

        console.log(`✅ Screenshot saved: ${filepath}`);

        // Report console errors
        if (consoleMessages.length > 0) {
            console.log('\n⚠️  Console errors detected:');
            consoleMessages.forEach(msg => console.log(`   ${msg}`));
        }

        // Check for avatar element
        const avatarExists = await page.evaluate(() => {
            const selectors = [
                '#avatar', '.avatar', '[data-testid="avatar"]',
                'canvas', '.three-container', '#three-canvas'
            ];
            for (const sel of selectors) {
                if (document.querySelector(sel)) return sel;
            }
            return null;
        });

        if (avatarExists) {
            console.log(`✅ Avatar element found: ${avatarExists}`);
        } else {
            console.log('⚠️  No avatar element found');
        }

        // Return info
        return {
            success: true,
            filepath,
            filename,
            consoleErrors: consoleMessages.length,
            avatarFound: !!avatarExists
        };

    } catch (error) {
        console.error(`❌ Screenshot failed: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const name = args[0] || 'eva';
    const url = args[1] || DEFAULT_URL;

    takeScreenshot(name, url)
        .then(result => {
            if (result.success) {
                console.log('\n📊 Result:', JSON.stringify(result, null, 2));
                process.exit(0);
            } else {
                process.exit(1);
            }
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { takeScreenshot };
