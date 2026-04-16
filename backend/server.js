import { WebSocketServer } from 'ws'

const port = process.env.PORT || 1234
const wss = new WebSocketServer({ port })

// set clients
const clients = new Set()

wss.on('connection', (ws) => {
  clients.add(ws)
  console.log(`✅ Cliente conectado. Total: ${clients.size}`)
  
  ws.on('message', (data) => {
    // send to all clients except sender
    clients.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(data)
      }
    })
  })
  
  ws.on('close', () => {
    clients.delete(ws)
    console.log(`❌ Cliente desconectado. Total: ${clients.size}`)
    
    // Notify all remaining clients about the disconnection
    const disconnectMessage = JSON.stringify({ type: 'user-disconnected' })
    clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(disconnectMessage)
      }
    })
  })
})

console.log(`🚀 Servidor corriendo en 0.0.0.0:${port}`)