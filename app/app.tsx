import { useState } from 'preact/hooks'
import './app.css'
import { WebSocketDemo } from './WebSocketDemo'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <div id="app">
      <header class="hero">
        <div class="logo-row">
          <a href="https://vite.dev" target="_blank">
            <img src="/vite.svg" class="logo" alt="Vite logo" />
            <div class="logo-label">Vite</div>
          </a>
          <a href="https://v3.nitro.build" target="_blank">
            <img src="/nitro.svg" class="logo" alt="Nitro logo" />
            <div class="logo-label">Nitro</div>
          </a>
          <a href="https://preactjs.com" target="_blank">
            <img src="/preact.svg" class="logo preact" alt="Preact logo" />
            <div class="logo-label">Preact</div>
          </a>
        </div>

        <h1>Vite + Nitro + Preact</h1>
        <p class="tagline">Tiny demo — interactive UI & server API in one place</p>
      </header>

      <main>
        <section class="demo-grid">
          <div class="card">
            <button type="button" onClick={() => setCount((c) => c + 1)}>
              count is {count}
            </button>
            <p class="muted">Test client state</p>
          </div>

          <div class="card">
            <button type="button" onClick={async () => {
              const res = await fetch('/api/hello')
              const data = await res.text()
              alert(JSON.stringify(data))
            }}>
              Call /api/hello
            </button>
            <p class="muted">Simple server endpoint returning a greeting</p>
          </div>

          <div class="card">
            <button type="button" onClick={async () => {
              const res = await fetch('/api/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ echo: 'Hello from client!' }),
              })
              const data = await res.json()
              alert(JSON.stringify(data.echoed))
            }}>
              Call /api/test
            </button>
            <p class="muted">Server endpoint echoing back the sent message</p>
          </div>
        </section>

        <section class="card ws-section">
          <WebSocketDemo />
        </section>

        <section class="features card">
          <h2>Try these</h2>
          <ul>
            <li>Click the logos to open their docs</li>
            <li>Increment the counter to exercise client state and HMR</li>
            <li>Call <code>/api/hello</code> to test a server response</li>
            <li>Use the WebSocket chat to test real-time bidirectional communication</li>
          </ul>
        </section>
      </main>

      <footer class="site-footer">
        <small>Made with ❤️ using Vite, Nitro and Preact</small>
      </footer>
    </div>
  )
}
