import { useEffect, useRef, useState } from 'react'
import { Stage, Layer, Line, Circle, Text, Rect, Group } from 'react-konva'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { HexColorPicker } from 'react-colorful'
import './index.css'

const WS_URL = import.meta.env.VITE_WS_URL || 'wss://backend-winter-grass-6714.fly.dev'
const ROOM_NAME = 'peopledraw-room'

function App() {
  const [username, setUsername] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [color, setColor] = useState('#2d8cf0')
  const [doc] = useState(() => new Y.Doc())
  const [provider, setProvider] = useState(null)
  const [strokes, setStrokes] = useState([])
  const [cursors, setCursors] = useState([])
  const [boardSize, setBoardSize] = useState({ width: 800, height: 600 })
  const boardRef = useRef(null)
  const currentStrokeRef = useRef(null)
  const isDrawingRef = useRef(false)

  // Obtener strokes del documento Yjs
  const getStrokesFromDoc = (yStrokes) => {
    return yStrokes.toArray().map((yStroke) => {
      const points = yStroke.get('points').toArray()
      return {
        id: yStroke.get('id'),
        points: points,
        color: yStroke.get('color'),
        width: yStroke.get('width'),
        user: yStroke.get('user'),
      }
    })
  }

  // Sincronizar strokes con el estado local
  const syncStrokes = (yStrokes) => {
    setStrokes(getStrokesFromDoc(yStrokes))
  }

  // Inicializar conexión y sincronización
  useEffect(() => {
    if (!username) return

    // Crear provider WebSocket
    const wsProvider = new WebsocketProvider(WS_URL, ROOM_NAME, doc)
    const yStrokes = doc.getArray('strokes')

    // Función para actualizar strokes
    const updateStrokes = () => {
      setStrokes(getStrokesFromDoc(yStrokes))
    }

    // Función para actualizar awareness (cursores)
    const updateAwareness = () => {
      const states = []
      wsProvider.awareness.getStates().forEach((state, clientId) => {
        if (state.user && state.cursor) {
          states.push({ clientId, ...state })
        }
      })
      setCursors(states)
    }

    // Observar cambios en los strokes
    yStrokes.observe(updateStrokes)
    wsProvider.awareness.on('change', updateAwareness)

    // Establecer estado local del usuario
    wsProvider.awareness.setLocalState({
      user: { name: username, color },
      cursor: { x: 0, y: 0 }
    })

    // Cargar strokes existentes
    updateStrokes()
    updateAwareness()
    
    setProvider(wsProvider)

    // Cleanup
    return () => {
      yStrokes.unobserve(updateStrokes)
      wsProvider.awareness.off('change', updateAwareness)
      wsProvider.destroy()
      setProvider(null)
    }
  }, [username, doc, color]) // Añadimos color como dependencia

  // Actualizar color en awareness cuando cambie
  useEffect(() => {
    if (provider && username) {
      const currentState = provider.awareness.getLocalState() || {}
      provider.awareness.setLocalState({
        ...currentState,
        user: { name: username, color }
      })
    }
  }, [color, provider, username])

  // Manejar inicio del dibujo
  const startStroke = (event) => {
    if (!provider || !username) return
    
    const stage = event.target.getStage()
    if (!stage) return

    const point = stage.getPointerPosition()
    if (!point) return

    isDrawingRef.current = true

    const yStrokes = doc.getArray('strokes')
    
    // Crear nuevo stroke
    const stroke = new Y.Map()
    stroke.set('id', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    stroke.set('color', color)
    stroke.set('width', 5)
    stroke.set('user', username)
    
    const points = new Y.Array()
    points.push([point.x, point.y])
    stroke.set('points', points)
    
    yStrokes.push([stroke])
    currentStrokeRef.current = stroke

    // Actualizar cursor
    provider.awareness.setLocalStateField('cursor', { x: point.x, y: point.y })
  }

  // Manejar dibujo continuo
  const continueStroke = (event) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return
    
    const stage = event.target.getStage()
    if (!stage) return
    
    const point = stage.getPointerPosition()
    if (!point) return

    // Agregar punto al stroke actual
    const points = currentStrokeRef.current.get('points')
    points.push([point.x, point.y])

    // Actualizar cursor
    if (provider) {
      provider.awareness.setLocalStateField('cursor', { x: point.x, y: point.y })
    }
  }

  // Manejar fin del dibujo
  const endStroke = () => {
    isDrawingRef.current = false
    currentStrokeRef.current = null
  }

  // Manejar envío de nombre
  const onSubmitName = (event) => {
    event.preventDefault()
    const trimmedName = nameInput.trim()
    if (trimmedName) {
      setUsername(trimmedName)
    }
  }

  // Manejar resize del board
  useEffect(() => {
    const handleResize = () => {
      if (boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect()
        setBoardSize({ 
          width: Math.max(rect.width, 400), 
          height: Math.max(rect.height, 400) 
        })
      }
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="app-shell">
      {!username && (
        <div className="modal">
          <div className="modal-card">
            <h1>Bienvenido a PeopleDraw</h1>
            <p>Elige un nombre para aparecer en el tablero compartido.</p>
            <form onSubmit={onSubmitName} className="name-form">
              <input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                placeholder="Tu nombre"
                autoFocus
              />
              <button type="submit">Entrar</button>
            </form>
          </div>
        </div>
      )}

      <header className="topbar">
        <div>
          <strong>PeopleDraw</strong>
          <span>Tablero colaborativo en tiempo real</span>
        </div>
        <div className="status-bar">
          {username ? (
            <>
              <span>Usuario: <strong>{username}</strong></span>
              <span>Conexión: <strong>{provider ? 'Activa' : 'Esperando...'}</strong></span>
              <span>Participantes: <strong>{cursors.length}</strong></span>
            </>
          ) : (
            <span>Completá tu nombre para conectar</span>
          )}
        </div>
      </header>

      <main className="content">
        <aside className="sidebar">
          <div className="panel">
            <h2>Color</h2>
            <HexColorPicker color={color} onChange={setColor} />
            <input 
              type="text" 
              value={color} 
              onChange={(event) => setColor(event.target.value)} 
            />
          </div>

          <div className="panel">
            <h2>Usuarios conectados</h2>
            <ul className="user-list">
              {cursors.map((cursor) => (
                <li key={cursor.clientId}>
                  <span 
                    className="user-swatch" 
                    style={{ background: cursor.user.color }} 
                  />
                  <span>{cursor.user.name}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2>Instrucciones</h2>
            <p>Haz clic y arrastra para dibujar. Todos ven los cambios en tiempo real.</p>
          </div>
        </aside>

        <section className="board" ref={boardRef}>
          <Stage
            width={boardSize.width}
            height={boardSize.height}
            onMouseDown={startStroke}
            onTouchStart={startStroke}
            onMouseMove={continueStroke}
            onTouchMove={continueStroke}
            onMouseUp={endStroke}
            onTouchEnd={endStroke}
            onMouseLeave={endStroke}
          >
            <Layer>
              <Rect 
                x={0} 
                y={0} 
                width={boardSize.width} 
                height={boardSize.height} 
                fill="#ffffff" 
              />
              {strokes.map((stroke) => (
                <Line
                  key={stroke.id}
                  points={stroke.points.flat()}
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                />
              ))}
              {cursors
                .filter((cursor) => cursor.user.name !== username)
                .map((cursor) => (
                  <Group key={cursor.clientId}>
                    <Circle
                      x={cursor.cursor.x}
                      y={cursor.cursor.y}
                      radius={8}
                      fill={cursor.user.color || '#f15bb5'}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                    <Text
                      x={cursor.cursor.x + 12}
                      y={cursor.cursor.y - 12}
                      text={cursor.user.name}
                      fontSize={14}
                      fill={cursor.user.color || '#111'}
                      background="#fff"
                      padding={4}
                    />
                  </Group>
                ))}
            </Layer>
          </Stage>
        </section>
      </main>
    </div>
  )
}

export default App