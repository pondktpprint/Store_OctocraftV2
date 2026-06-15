const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:4987/bridge?token=bridgetoken123');

ws.on('open', () => {
  console.log('WS Connected');
  ws.send(JSON.stringify({ type: 'ready' }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg);
  if (msg.type === 'execute_command') {
    ws.send(JSON.stringify({
      type: 'delivery_result',
      message_id: msg.message_id,
      success: true
    }));
    console.log('Sent success result');
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 1000);
  }
});

ws.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout');
  process.exit(1);
}, 5000);
