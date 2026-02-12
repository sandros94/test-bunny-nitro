import { defineConfig } from 'vite'

import preact from '@preact/preset-vite'
import tw from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    tw(),
    nitro(),
  ],
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: "./app/entry-client.tsx",
        },
      },
    },
    ssr: {
      build: {
        rollupOptions: {
          input: "./app/entry-server.tsx",
        }
      }
    }
  },
})
