#!/usr/bin/env node

/**
 * Simple WebSocket server for Yjs collaboration
 */

const WebSocket = require('ws')
const http = require('http')
const wss = new WebSocket.Server({ noServer: true })

const port = process.env.PORT || 1234
const host = process.env.HOST || 'localhost'

// Map to store room connections
const rooms = new Map()

wss.on('connection', (conn, req, { room }) => {
  console.log(`[${new Date().toISOString()}] Client connected to room: ${room}`)
  
  // Add client to the room
  if (!rooms.has(room)) {
    rooms.set(room, new Set())
  }
  rooms.get(room).add(conn)
  
  // Send confirmation to the client
  conn.send(JSON.stringify({
    type: 'connection-established',
    room
  }))
  
  // Broadcast messages to all clients in the room
  conn.on('message', (message) => {
    if (rooms.has(room)) {
      rooms.get(room).forEach((client) => {
        if (client !== conn && client.readyState === WebSocket.OPEN) {
          client.send(message.toString())
        }
      })
    }
  })
  
  // Handle disconnection
  conn.on('close', () => {
    console.log(`[${new Date().toISOString()}] Client disconnected from room: ${room}`)
    
    // Remove client from the room
    if (rooms.has(room)) {
      rooms.get(room).delete(conn)
      
      // Remove room if empty
      if (rooms.get(room).size === 0) {
        rooms.delete(room)
        console.log(`[${new Date().toISOString()}] Room deleted: ${room}`)
      }
    }
  })
})

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('Blockly Collaboration WebSocket Server\n')
})

server.on('upgrade', (request, socket, head) => {
  // Extract room from URL path
  const pathname = request.url.slice(1).split('/')
  const room = pathname[0] || 'default-room'
  
  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit('connection', ws, request, { room })
  })
})

server.listen(port, host, () => {
  console.log(`\nBlockly Collaboration WebSocket Server running at:\n`)
  console.log(`http://${host}:${port}`)
  console.log(`\nConnect to this server in your Blockly app using:`)
  console.log(`ws://${host}:${port}`)
  console.log(`\nPress Ctrl+C to stop\n`)
})
