import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { nitro } from 'nitro/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    preact(),
    nitro({
      serverDir: './server',
      preset: 'deno-server',
      // serveStatic: false,
      // rolldownConfig: {
      //   output: {
      //     format: 'esm',
      //   },
      //   external: ['h3', 'valibot'],
      // },
    }),
  ],
})
