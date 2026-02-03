import { useState } from 'preact/hooks'
import './app.css'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" class="logo" alt="Vite logo" />
        </a>
        <a href="https://nitro.build" target="_blank">
          <img src="/nitro.svg" class="logo" alt="Nitro logo" />
        </a>
        <a href="https://preactjs.com" target="_blank">
          <img src="/preact.svg" class="logo preact" alt="Preact logo" />
        </a>
      </div>
      <h1>Vite + Nitro + Preact</h1>
      <div class="card">
        <button type="button" onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>app/app.tsx</code> and save to test HMR
        </p>
      </div>
      <div class="card">
        <button type="button" onClick={async () => {
          const res = await fetch('/api/hello')
          const data = await res.text()
          alert(JSON.stringify(data))
        }}>
          Call /api/hello
        </button>
      </div>
      <p>
        Check out{' '}
        <a
          href="https://preactjs.com/guide/v10/getting-started#create-a-vite-powered-preact-app"
          target="_blank"
        >
          create-preact
        </a>
        , the official Preact + Vite starter
      </p>
      <p class="read-the-docs">
        Click on the Vite and Preact logos to learn more
      </p>
    </>
  )
}
