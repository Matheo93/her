const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8000/ws/her');

ws.on('open', function open() {
    console.log('[WS] Connected to ws://localhost:8000/ws/her');

    // Send config
    ws.send(JSON.stringify({
        type: 'config',
        user_id: 'test_user',
        voice: 'french'
    }));
    console.log('[WS] Sent config');

    // Send test message after 1s
    setTimeout(() => {
        console.log('[WS] Sending test message...');
        ws.send(JSON.stringify({
            type: 'message',
            content: 'Bonjour Eva, comment vas-tu?',
            user_id: 'test_user'
        }));
    }, 1000);
});

ws.on('message', function message(data) {
    const msg = JSON.parse(data.toString());
    console.log('[WS] Received:', msg.type, msg.content ? msg.content.substring(0, 50) + '...' : '');
});

ws.on('error', function error(err) {
    console.log('[WS] Error:', err.message);
});

ws.on('close', function close() {
    console.log('[WS] Connection closed');
});

// Close after 30 seconds
setTimeout(() => {
    console.log('[WS] Timeout - closing');
    ws.close();
    process.exit(0);
}, 30000);
