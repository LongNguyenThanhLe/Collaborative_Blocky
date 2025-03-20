#!/usr/bin/env node
const WebSocket = require('ws');

// Try different URL patterns to determine which one works
const testUrls = [
  'wss://blockly-collab-server.onrender.com/test-room',
  'wss://blockly-collab-server.onrender.com',
  'wss://blockly-collab-server.onrender.com/yjs/test-room'
];

testUrls.forEach(url => {
  console.log(`Attempting to connect to: ${url}`);
  
  const ws = new WebSocket(url);
  
  ws.on('open', () => {
    console.log(`SUCCESS: Connected to ${url}`);
    ws.close();
  });
  
  ws.on('error', (err) => {
    console.log(`FAILED: Could not connect to ${url}`, err.message);
  });
});
