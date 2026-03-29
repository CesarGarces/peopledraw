import { WebSocketServer } from 'ws'

const port = process.env.PORT || 1234
const wss = new WebSocketServer({ port })

console.log(`🚀 Servidor WebSocket corriendo en puerto ${port}`)

wss.on('connection', (ws) => {
  console.log('✅ Cliente conectado')
  
  // Enviar mensaje de bienvenida (opcional)
  ws.send(JSON.stringify({ type: 'welcome', message: 'Conectado al servidor' }))
  
  ws.on('message', (data) => {
    console.log('📨 Mensaje recibido, reenviando a otros clientes...')
    
    // Reenviar el mensaje a todos los demás clientes
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data)
        console.log('✅ Mensaje reenviado')
      }
    })
  })
  
  ws.on('close', () => {
    console.log('❌ Cliente desconectado')
  })
  
  ws.on('error', (error) => {
    console.error('Error en WebSocket:', error.message)
  })
})

// Manejar errores del servidor
wss.on('error', (error) => {
  console.error('Error del servidor:', error.message)
})