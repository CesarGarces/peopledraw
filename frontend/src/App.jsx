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
  const [remoteCurrentStrokes, setRemoteCurrentStrokes] = useState({})
  const [boardSize, setBoardSize] = useState({ width: 800, height: 600 })
  const [currentLocalStroke, setCurrentLocalStroke] = useState(null)
  const boardRef = useRef(null)
  const currentStrokeRef = useRef(null)
  const isDrawingRef = useRef(false)
  const providerRef = useRef(null)

  // Get strokes from Yjs document
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

  // Initialize WebSocket connection and synchronization
  useEffect(() => {
    if (!username) return

    // Create WebSocket provider
    const wsProvider = new WebsocketProvider(WS_URL, ROOM_NAME, doc)
    const yStrokes = doc.getArray('strokes')

    // Function to update strokes
    const updateStrokes = () => {
      const newStrokes = getStrokesFromDoc(yStrokes)
      setStrokes(newStrokes)

      // If currentLocalStroke already appears in synced strokes, clean up
      if (currentLocalStroke) {
        const found = newStrokes.find((s) => s.id === currentLocalStroke.id)
        if (found) {
          setCurrentLocalStroke(null)
          // Also clear from awareness
          const currentState = wsProvider.awareness.getLocalState() || {}
          wsProvider.awareness.setLocalState({
            ...currentState,
            currentStroke: null
          })
        }
      }

      // Clean up remote strokes that have already arrived at Yjs
      setRemoteCurrentStrokes((prev) => {
        const updated = { ...prev }
        Object.keys(updated).forEach((clientId) => {
          const strokeId = updated[clientId].id
          if (newStrokes.find((s) => s.id === strokeId)) {
            delete updated[clientId]
          }
        })
        return Object.keys(updated).length === Object.keys(prev).length ? prev : updated
      })
    }

    // Function to update awareness (cursors and in-progress strokes)
    const updateAwareness = () => {
      const states = []
      const remoteStrokes = {}
      
      wsProvider.awareness.getStates().forEach((state, clientId) => {
        if (state.user && state.cursor) {
          states.push({ clientId, ...state })
        }
        // Collect in-progress strokes from other users
        if (state.currentStroke && state.user.name !== username) {
          remoteStrokes[clientId] = state.currentStroke
        }
      })
      
      setCursors(states)
      setRemoteCurrentStrokes(remoteStrokes)
    }

    // Watch for changes in strokes
    yStrokes.observe(updateStrokes)
    wsProvider.awareness.on('change', updateAwareness)

    // Set local user state
    wsProvider.awareness.setLocalState({
      user: { name: username, color },
      cursor: { x: 0, y: 0 }
    })

    // Load existing strokes
    updateStrokes()
    updateAwareness()
    
    setProvider(wsProvider)
    providerRef.current = wsProvider

    // Cleanup
    return () => {
      // Clear user state from awareness before disconnecting
      try {
        wsProvider.awareness.setLocalState(null)
      } catch (e) {
        // Ignore errors during cleanup
      }
      
      yStrokes.unobserve(updateStrokes)
      wsProvider.awareness.off('change', updateAwareness)
      wsProvider.destroy()
      setProvider(null)
      providerRef.current = null
    }
  }, [username, doc])

  // Update color in awareness when it changes
  useEffect(() => {
    if (provider && username) {
      const currentState = provider.awareness.getLocalState() || {}
      provider.awareness.setLocalState({
        ...currentState,
        user: { name: username, color }
      })
    }
  }, [color, provider, username])

  // Handle start of drawing
  const startStroke = (event) => {
    if (!provider || !username) return
    
    const stage = event.target.getStage()
    if (!stage) return

    const point = stage.getPointerPosition()
    if (!point) return

    isDrawingRef.current = true

    const yStrokes = doc.getArray('strokes')
    
    // Create new stroke in Yjs
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

    // Create locally visible stroke (no delay)
    const localStroke = {
      id: stroke.get('id'),
      points: [[point.x, point.y]],
      color: color,
      width: 5,
      user: username,
    }
    setCurrentLocalStroke(localStroke)

    // Transmit in-progress stroke through awareness
    const currentState = provider.awareness.getLocalState() || {}
    provider.awareness.setLocalState({
      ...currentState,
      currentStroke: localStroke
    })

    // Update cursor
    provider.awareness.setLocalStateField('cursor', { x: point.x, y: point.y })
  }

  // Handle mouse movement always
  const handleMouseMove = (event) => {
    if (!provider || !username) return

    const stage = event.target.getStage()
    if (!stage) return

    const point = stage.getPointerPosition()
    if (!point) return

    // Update cursor in awareness
    provider.awareness.setLocalStateField('cursor', { x: point.x, y: point.y })

    // If we're drawing, add point to stroke
    if (isDrawingRef.current && currentStrokeRef.current) {
      const points = currentStrokeRef.current.get('points')
      points.push([point.x, point.y])

      // Update local stroke too (to see without delay)
      const updatedStroke = {
        id: currentStrokeRef.current.get('id'),
        points: points.toArray(),
        color: currentStrokeRef.current.get('color'),
        width: currentStrokeRef.current.get('width'),
        user: currentStrokeRef.current.get('user'),
      }
      setCurrentLocalStroke(updatedStroke)

      // Transmit in-progress stroke through awareness (real-time)
      const currentState = provider.awareness.getLocalState() || {}
      provider.awareness.setLocalStateField('currentStroke', updatedStroke)
    }
  }

  // Handle end of drawing
  const endStroke = () => {
    isDrawingRef.current = false
    currentStrokeRef.current = null
    // currentStroke will be automatically cleared in updateStrokes when synced
  }

  // Handle name submission
  const onSubmitName = (event) => {
    event.preventDefault()
    const trimmedName = nameInput.trim()
    if (trimmedName) {
      setUsername(trimmedName)
    }
  }

  // Handle board resize
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

  // Handle page unload to properly disconnect user
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Clear user state when closing browser/tab
      if (providerRef.current) {
        try {
          providerRef.current.awareness.setLocalState(null)
        } catch (e) {
          // Ignore errors
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
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
            onMouseMove={handleMouseMove}
            onTouchMove={handleMouseMove}
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
              {currentLocalStroke && (
                <Line
                  points={currentLocalStroke.points.flat()}
                  stroke={currentLocalStroke.color}
                  strokeWidth={currentLocalStroke.width}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                />
              )}
              {Object.entries(remoteCurrentStrokes).map(([clientId, stroke]) => (
                <Line
                  key={`remote-${clientId}`}
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