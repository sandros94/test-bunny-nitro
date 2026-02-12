import { useState, useEffect, useRef } from 'preact/hooks'

interface Message {
  user: string
  message: string
  timestamp: number
}

export function WebSocketDemo() {
  const [isConnected, setIsConnected] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  const connectWebSocket = () => {
    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.onclose = null // Remove handler to prevent state update
      wsRef.current.close()
      wsRef.current = null
    }

    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/_ws`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      console.log('WebSocket connected')
    }

    ws.onmessage = async (event) => {
      try {
        let data
        // Handle both Blob (from peer.publish) and string (from peer.send)
        if (event.data instanceof Blob) {
          const text = await event.data.text()
          data = JSON.parse(text)
        } else {
          data = JSON.parse(event.data)
        }
        setMessages((prev) => [...prev, { ...data, timestamp: Date.now() }])
      } catch (error) {
        console.error('Failed to parse message:', error, event.data)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      setIsConnected(false)
      console.log('WebSocket disconnected')
    }
  }

  useEffect(() => {
    connectWebSocket()

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null // Prevent state update on unmount
        wsRef.current.close()
      }
    }
  }, [])

  const reconnect = () => {
    setIsConnected(false)
    // Small delay to ensure clean disconnect
    setTimeout(connectWebSocket, 100)
  }

  const sendMessage = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && inputMessage.trim()) {
      wsRef.current.send(inputMessage)
      setInputMessage('')
    }
  }

  const sendPing = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send('ping')
    }
  }

  const clearMessages = () => {
    setMessages([])
  }

  return (
    <div class="websocket-demo">
      <div class="ws-header">
        <h3>WebSocket Chat</h3>
        {isConnected ? (
          <span class="status-indicator connected">● Connected</span>
        ) : (
          <button class="status-indicator disconnected reconnect-btn" onClick={reconnect}>
            ○ Disconnected (Click to reconnect)
          </button>
        )}
      </div>

      <div class="ws-messages">
        {messages.length === 0 ? (
          <p class="no-messages">No messages yet. Open multiple tabs to test real-time chat!</p>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} class={`message ${msg.user === 'server' ? 'server-message' : 'user-message'}`}>
              <strong>{msg.user}:</strong> {msg.message}
            </div>
          ))
        )}
      </div>

      <div class="ws-controls">
        <div class="input-group">
          <input
            type="text"
            value={inputMessage}
            onInput={(e) => setInputMessage((e.target as HTMLInputElement).value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            disabled={!isConnected}
          />
          <button onClick={sendMessage} disabled={!isConnected || !inputMessage.trim()}>
            Send
          </button>
        </div>
        <div class="action-buttons">
          <button onClick={sendPing} disabled={!isConnected}>
            Send Ping
          </button>
          <button onClick={clearMessages}>
            Clear
          </button>
        </div>
      </div>

      <p class="muted">
        Try "ping" for a server response, or open multiple tabs to see messages broadcast to all connected clients
      </p>

      <style>{`
        .websocket-demo {
          text-align: left;
        }

        .ws-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .ws-header h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .ws-status {
          font-size: 0.85rem;
        }

        .status-indicator {
          font-size: 0.85rem;
        }

        .status-indicator.connected {
          color: #10b981;
        }

        .status-indicator.disconnected {
          color: #ef4444;
        }

        .reconnect-btn {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.85rem;
        }

        .reconnect-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.5);
        }

        .ws-messages {
          min-height: 250px;
          max-height: 350px;
          overflow-y: auto;
          background: rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 0.75rem;
          margin-bottom: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .no-messages {
          color: rgba(255, 255, 255, 0.5);
          text-align: center;
          margin: auto;
          font-size: 0.9rem;
        }

        .message {
          padding: 0.4rem 0.6rem;
          border-radius: 6px;
          font-size: 0.9rem;
          line-height: 1.4;
          animation: slideIn 0.2s ease-out;
          background: rgba(255, 255, 255, 0.05);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .server-message {
          border-left: 2px solid #3b82f6;
        }

        .user-message {
          border-left: 2px solid #10b981;
        }

        .message strong {
          margin-right: 0.4rem;
          opacity: 0.9;
        }

        .ws-controls {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .input-group {
          display: flex;
          gap: 0.5rem;
        }

        .input-group input {
          flex: 1;
          padding: 0.5rem 0.75rem;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-size: 0.9rem;
          color: inherit;
        }

        .input-group input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        .input-group input:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.25);
          background: rgba(0, 0, 0, 0.25);
        }

        .input-group input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .input-group button,
        .action-buttons button {
          padding: 0.5rem 1rem;
          background: rgba(255, 255, 255, 0.08);
          color: inherit;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .input-group button:hover:not(:disabled),
        .action-buttons button:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .input-group button:disabled,
        .action-buttons button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .action-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        @media (prefers-color-scheme: light) {
          .ws-messages {
            background: rgba(0, 0, 0, 0.02);
            border-color: rgba(0, 0, 0, 0.08);
          }

          .no-messages {
            color: rgba(0, 0, 0, 0.4);
          }

          .message {
            background: rgba(0, 0, 0, 0.03);
          }

          .input-group input {
            background: rgba(0, 0, 0, 0.03);
            border-color: rgba(0, 0, 0, 0.1);
          }

          .input-group input::placeholder {
            color: rgba(0, 0, 0, 0.4);
          }

          .input-group input:focus {
            background: rgba(0, 0, 0, 0.05);
            border-color: rgba(0, 0, 0, 0.2);
          }

          .input-group button,
          .action-buttons button {
            background: rgba(0, 0, 0, 0.04);
            border-color: rgba(0, 0, 0, 0.1);
          }

          .input-group button:hover:not(:disabled),
          .action-buttons button:hover:not(:disabled) {
            background: rgba(0, 0, 0, 0.08);
            border-color: rgba(0, 0, 0, 0.15);
          }
        }
      `}</style>
    </div>
  )
}
