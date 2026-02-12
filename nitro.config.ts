import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: './server',
  preset: './preset/bunny.ts',
  features: {
    websocket: true,
  },
});
