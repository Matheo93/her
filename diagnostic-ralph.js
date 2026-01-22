const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');

// Latency measurement function
async function measureLatency(url, payload) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(payload))
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - start;
        try {
          resolve({ latency, data: JSON.parse(data), status: res.statusCode });
        } catch (e) {
          resolve({ latency, data, status: res.statusCode });
        }
      });
    });

    req.on('error', (e) => {
      reject({ error: e.message, latency: Date.now() - start });
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

(async () => {
  console.log('='.repeat(60));
  console.log('RALPH DIAGNOSTIC - ' + new Date().toISOString());
  console.log('='.repeat(60));

  const results = {
    timestamp: new Date().toISOString(),
    latency: {},
    screenshots: [],
    errors: [],
    avatar: {},
    personality: {}
  };

  // PHASE 1: Latency Test
  console.log('\n[PHASE 1] LATENCY MEASUREMENT');
  console.log('-'.repeat(40));

  try {
    const chatPayload = { message: "Bonjour, comment vas-tu?", session_id: "diagnostic-" + Date.now() };
    console.log('Testing /chat endpoint...');
    const chatResult = await measureLatency('http://localhost:8000/chat', chatPayload);
    results.latency.chat = chatResult.latency;
    console.log(`/chat latency: ${chatResult.latency}ms ${chatResult.latency < 500 ? '✅' : '❌ BLOCKING'}`);

    if (chatResult.data && chatResult.data.response) {
      results.personality.response = chatResult.data.response.substring(0, 200);
      console.log(`Response preview: "${chatResult.data.response.substring(0, 100)}..."`);
    }
  } catch (e) {
    console.log('❌ /chat failed:', e.error || e.message);
    results.errors.push('Chat endpoint failed: ' + (e.error || e.message));
  }

  // PHASE 2: Puppeteer Screenshots
  console.log('\n[PHASE 2] PUPPETEER SCREENSHOTS');
  console.log('-'.repeat(40));

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.toString()));

  // Screenshot 1: Initial load /eva-her
  try {
    console.log('Loading /eva-her...');
    await page.goto('http://localhost:3000/eva-her', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: '.claude/screenshots/diagnostic-t0.png', fullPage: true });
    results.screenshots.push('diagnostic-t0.png');
    console.log('✅ Screenshot 1: diagnostic-t0.png');
  } catch (e) {
    console.log('❌ Screenshot 1 failed:', e.message);
    results.errors.push('Screenshot 1 failed: ' + e.message);
  }

  // Check avatar visibility
  try {
    const avatarVisible = await page.evaluate(() => {
      const avatar = document.querySelector('svg') || document.querySelector('.avatar') || document.querySelector('[class*="avatar"]');
      return avatar ? { found: true, tag: avatar.tagName } : { found: false };
    });
    results.avatar.visible = avatarVisible.found;
    console.log(`Avatar visible: ${avatarVisible.found ? '✅' : '❌'} ${avatarVisible.tag || ''}`);
  } catch (e) {
    results.avatar.visible = false;
    console.log('❌ Avatar check failed:', e.message);
  }

  // Screenshot 2: After interaction attempt
  try {
    // Try to find and click on chat input
    const inputSelector = 'input[type="text"], textarea, [contenteditable="true"]';
    const input = await page.$(inputSelector);
    if (input) {
      await input.type('Bonjour EVA!');
      console.log('✅ Found input, typed message');

      // Try to submit
      const submitBtn = await page.$('button[type="submit"], button:has-text("Send"), button:has-text("Envoyer")');
      if (submitBtn) {
        await submitBtn.click();
        console.log('✅ Clicked submit');
        await new Promise(r => setTimeout(r, 5000)); // Wait for response
      }
    }

    await page.screenshot({ path: '.claude/screenshots/diagnostic-t1.png', fullPage: true });
    results.screenshots.push('diagnostic-t1.png');
    console.log('✅ Screenshot 2: diagnostic-t1.png');
  } catch (e) {
    console.log('⚠️ Interaction test:', e.message);
    await page.screenshot({ path: '.claude/screenshots/diagnostic-t1.png', fullPage: true });
    results.screenshots.push('diagnostic-t1.png');
  }

  // Screenshot 3: Check home page
  try {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: '.claude/screenshots/diagnostic-home.png', fullPage: true });
    results.screenshots.push('diagnostic-home.png');
    console.log('✅ Screenshot 3: diagnostic-home.png');
  } catch (e) {
    console.log('❌ Home screenshot failed:', e.message);
  }

  results.errors = [...results.errors, ...consoleErrors.slice(0, 10)];

  await browser.close();

  // PHASE 3: Report
  console.log('\n[PHASE 3] DIAGNOSTIC REPORT');
  console.log('='.repeat(60));
  console.log(`Latency /chat: ${results.latency.chat || 'N/A'}ms`);
  console.log(`Status: ${results.latency.chat && results.latency.chat < 500 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Screenshots taken: ${results.screenshots.length}`);
  console.log(`Console errors: ${consoleErrors.length}`);
  console.log(`Avatar visible: ${results.avatar.visible ? '✅' : '❌'}`);

  if (consoleErrors.length > 0) {
    console.log('\nUnique errors:');
    [...new Set(consoleErrors)].slice(0, 5).forEach(e => console.log(`  - ${e.substring(0, 100)}`));
  }

  // Save results
  const fs = require('fs');
  fs.writeFileSync('.claude/metrics/diagnostic-' + Date.now() + '.json', JSON.stringify(results, null, 2));
  console.log('\n✅ Results saved to .claude/metrics/');

  // Exit code based on latency
  process.exit(results.latency.chat && results.latency.chat < 500 ? 0 : 1);
})();
