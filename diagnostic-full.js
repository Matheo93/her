const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');

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
    req.on('error', (e) => reject({ error: e.message, latency: Date.now() - start }));
    req.write(JSON.stringify(payload));
    req.end();
  });
}

(async () => {
  const timestamp = Date.now();
  console.log('='.repeat(60));
  console.log('RALPH FULL DIAGNOSTIC - ' + new Date().toISOString());
  console.log('='.repeat(60));

  const results = {
    timestamp: new Date().toISOString(),
    latency: { tests: [], average: 0, max: 0, min: 999999 },
    screenshots: [],
    errors: [],
    avatar: { visible: false, animated: false },
    personality: { responses: [], isEva: true }
  };

  // PHASE 1: Multiple latency tests
  console.log('\n[PHASE 1] LATENCY BENCHMARK (5 tests)');
  console.log('-'.repeat(40));

  for (let i = 1; i <= 5; i++) {
    const chatPayload = {
      message: `Test performance ${i} - ${timestamp}`,
      session_id: `bench-${timestamp}-${i}`
    };
    try {
      const result = await measureLatency('http://localhost:8000/chat', chatPayload);
      results.latency.tests.push(result.latency);
      results.latency.min = Math.min(results.latency.min, result.latency);
      results.latency.max = Math.max(results.latency.max, result.latency);
      console.log(`  Test ${i}: ${result.latency}ms ${result.latency < 300 ? '✅' : result.latency < 500 ? '⚠️' : '❌'}`);

      if (result.data?.response) {
        results.personality.responses.push(result.data.response);
      }
    } catch (e) {
      console.log(`  Test ${i}: ❌ FAILED - ${e.error || e.message}`);
      results.errors.push(`Latency test ${i} failed`);
    }
  }

  results.latency.average = Math.round(
    results.latency.tests.reduce((a, b) => a + b, 0) / results.latency.tests.length
  );
  console.log(`\n  Average: ${results.latency.average}ms`);
  console.log(`  Min/Max: ${results.latency.min}ms / ${results.latency.max}ms`);

  // PHASE 2: Puppeteer Screenshots with interaction
  console.log('\n[PHASE 2] PUPPETEER UI TESTING');
  console.log('-'.repeat(40));

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Screenshot 1: /eva-her initial
  console.log('Loading /eva-her...');
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '.claude/screenshots/eva-her-t0.png', fullPage: true });
  results.screenshots.push('eva-her-t0.png');
  console.log('✅ Screenshot 1: eva-her-t0.png (initial)');

  // Check avatar
  const avatarCheck = await page.evaluate(() => {
    const svg = document.querySelector('svg');
    const avatarDiv = document.querySelector('[class*="avatar"]');
    return {
      hasSvg: !!svg,
      hasAvatarDiv: !!avatarDiv,
      svgChildren: svg ? svg.children.length : 0
    };
  });
  results.avatar.visible = avatarCheck.hasSvg || avatarCheck.hasAvatarDiv;
  console.log(`Avatar: ${results.avatar.visible ? '✅ Visible' : '❌ Not found'} (SVG children: ${avatarCheck.svgChildren})`);

  // Screenshot 2: Try to interact
  console.log('Testing chat interaction...');
  try {
    const inputFound = await page.$('input, textarea');
    if (inputFound) {
      await inputFound.click();
      await inputFound.type('Bonjour EVA, comment vas-tu aujourdhui?');

      // Press Enter to submit
      await page.keyboard.press('Enter');
      console.log('✅ Message sent');

      // Wait for response
      await new Promise(r => setTimeout(r, 4000));
    } else {
      console.log('⚠️ No input field found');
    }
  } catch (e) {
    console.log('⚠️ Interaction error:', e.message);
  }

  await page.screenshot({ path: '.claude/screenshots/eva-her-t3.png', fullPage: true });
  results.screenshots.push('eva-her-t3.png');
  console.log('✅ Screenshot 2: eva-her-t3.png (after interaction)');

  // Screenshot 3: Home page
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: '.claude/screenshots/eva-home.png', fullPage: true });
  results.screenshots.push('eva-home.png');
  console.log('✅ Screenshot 3: eva-home.png');

  results.errors = [...results.errors, ...consoleErrors.slice(0, 5)];
  await browser.close();

  // PHASE 3: Personality check
  console.log('\n[PHASE 3] EVA PERSONALITY CHECK');
  console.log('-'.repeat(40));

  const chatGptIndicators = ['en tant que', 'je suis un', 'assistant', 'intelligence artificielle', 'openai', 'chatgpt'];
  const evaIndicators = ['haha', 'hihi', 'super', 'cool', 'sympa', 'eva', 'mdr'];

  let chatGptScore = 0;
  let evaScore = 0;

  for (const resp of results.personality.responses) {
    const lower = resp.toLowerCase();
    for (const ind of chatGptIndicators) {
      if (lower.includes(ind)) chatGptScore++;
    }
    for (const ind of evaIndicators) {
      if (lower.includes(ind)) evaScore++;
    }
    console.log(`  "${resp.substring(0, 60)}..."`);
  }

  results.personality.isEva = evaScore > chatGptScore;
  console.log(`\n  EVA indicators: ${evaScore}, ChatGPT indicators: ${chatGptScore}`);
  console.log(`  Personality: ${results.personality.isEva ? '✅ EVA' : '⚠️ Might be ChatGPT-like'}`);

  // PHASE 4: Final Report
  console.log('\n' + '='.repeat(60));
  console.log('FINAL REPORT');
  console.log('='.repeat(60));

  const latencyStatus = results.latency.average < 200 ? '✅ EXCELLENT' :
                        results.latency.average < 300 ? '✅ GOOD' :
                        results.latency.average < 500 ? '⚠️ ACCEPTABLE' : '❌ FAIL';

  console.log(`Latency:      ${results.latency.average}ms ${latencyStatus}`);
  console.log(`Avatar:       ${results.avatar.visible ? '✅' : '❌'}`);
  console.log(`Personality:  ${results.personality.isEva ? '✅ EVA' : '⚠️'}`);
  console.log(`Screenshots:  ${results.screenshots.length} captured`);
  console.log(`Errors:       ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.slice(0, 5).forEach(e => console.log(`  - ${e.substring(0, 80)}`));
  }

  // Score calculation
  let score = 0;
  if (results.latency.average < 200) score += 4;
  else if (results.latency.average < 300) score += 3;
  else if (results.latency.average < 500) score += 2;

  if (results.avatar.visible) score += 2;
  if (results.personality.isEva) score += 2;
  if (results.screenshots.length >= 3) score += 1;
  if (results.errors.length === 0) score += 1;

  console.log(`\n${'★'.repeat(score)}${'☆'.repeat(10-score)} SCORE: ${score}/10`);

  // Save results
  const filename = `.claude/metrics/diagnostic-${timestamp}.json`;
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${filename}`);

  process.exit(results.latency.average < 500 && results.avatar.visible ? 0 : 1);
})();
