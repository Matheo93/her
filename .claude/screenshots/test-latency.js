const WebSocket = require('ws');

const TESTS = 5;
const results = [];

async function measureLatency(testNum) {
    return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:8000/ws/her');
        const startTime = Date.now();
        let firstTokenTime = null;
        let firstSpeechTime = null;

        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'config',
                user_id: `latency_test_${testNum}_${Date.now()}`,
                voice: 'french'
            }));
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            const now = Date.now();

            if (msg.type === 'config_ok') {
                ws.send(JSON.stringify({
                    type: 'message',
                    content: `Test message ${testNum} unique ${Date.now()}`,
                    user_id: `latency_test_${testNum}`
                }));
            }

            if (msg.type === 'token' && !firstTokenTime) {
                firstTokenTime = now - startTime;
            }

            if (msg.type === 'speech' && !firstSpeechTime) {
                firstSpeechTime = now - startTime;
            }

            if (msg.type === 'speaking_end') {
                ws.close();
                resolve({
                    test: testNum,
                    firstToken: firstTokenTime,
                    firstSpeech: firstSpeechTime,
                    total: now - startTime
                });
            }
        });

        ws.on('error', (err) => {
            console.error('WS Error:', err.message);
            resolve({ test: testNum, error: err.message });
        });

        // Timeout after 30s
        setTimeout(() => {
            ws.close();
            resolve({ test: testNum, timeout: true });
        }, 30000);
    });
}

async function main() {
    console.log('=== EVA Latency Test ===\n');

    for (let i = 1; i <= TESTS; i++) {
        console.log(`Test ${i}/${TESTS}...`);
        const result = await measureLatency(i);
        results.push(result);
        console.log(`  First Token: ${result.firstToken}ms`);
        console.log(`  First Speech: ${result.firstSpeech}ms`);
        console.log(`  Total: ${result.total}ms\n`);

        // Wait 1s between tests
        await new Promise(r => setTimeout(r, 1000));
    }

    // Calculate averages
    const validResults = results.filter(r => !r.error && !r.timeout);
    if (validResults.length > 0) {
        const avgFirstToken = Math.round(validResults.reduce((a, b) => a + b.firstToken, 0) / validResults.length);
        const avgFirstSpeech = Math.round(validResults.reduce((a, b) => a + b.firstSpeech, 0) / validResults.length);
        const avgTotal = Math.round(validResults.reduce((a, b) => a + b.total, 0) / validResults.length);

        console.log('=== RESULTS ===');
        console.log(`Average First Token: ${avgFirstToken}ms`);
        console.log(`Average First Speech: ${avgFirstSpeech}ms`);
        console.log(`Average Total: ${avgTotal}ms`);
        console.log(`\nLatency target (<500ms): ${avgFirstToken < 500 ? 'PASS' : 'FAIL'}`);
    }

    process.exit(0);
}

main();
