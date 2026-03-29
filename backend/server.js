import { WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness.js'

const port = process.env.PORT || 1234
const wss = new WebSocketServer({ port })

// Almacenar documentos por sala
const docs = new Map()

wss.on('connection', (ws, req) => {
  console.log(`Cliente conectado desde: ${req.socket.remoteAddress}`)
  
  // Crear un documento para esta conexión
  let doc = null
  let awareness = null
  
  ws.on('message', (data) => {
    try {
      // Reenviar el mensaje a todos los clientes excepto al remitente
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data)
        }
      })
    } catch (error) {
      console.error('Error al procesar mensaje:', error)
    }
  })
  
  ws.on('close', () => {
    console.log('Cliente desconectado')
  })
  
  ws.on('error', (error) => {
    console.error('Error en WebSocket:', error)
  })
})

wss.on('error', (error) => {
  console.error('Error en el servidor:', error)
})

console.log(`Servidor WebSocket corriendo en ws://localhost:${port}`)
console.log('Esperando conexiones...')