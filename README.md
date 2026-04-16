# PeopleDraw

Proyecto separado en dos carpetas:

- `frontend` → aplicación React + Yjs + react-konva + react-colorful
- `backend` → servidor Node.js WebSocket usando `y-websocket`

## Local

1. `cd backend && npm install`
2. `npm start`
3. `cd ../frontend && npm install`
4. `npm run dev`

## Despliegue

- Frontend: Vercel
- Backend WebSocket: render.com

## Configuración

En `frontend/.env` puedes cambiar `VITE_WS_URL` al endpoint del servidor WebSocket.
