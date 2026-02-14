import "#nitro/virtual/polyfills";
import type { ServerRequest } from "srvx";
import type { WebSocketHooks } from "h3";
import { useNitroApp } from "nitro/app";

import { serve } from "srvx/bunny";
import wsAdapter from "./ws.mjs";

// Nitro Internal: Resolves WebSocket hooks for incoming upgrade requests
async function resolveWebsocketHooks(req: ServerRequest): Promise<Partial<WebSocketHooks>> {
  // https://github.com/h3js/h3/blob/c11ca743d476e583b3b47de1717e6aae92114357/src/utils/ws.ts#L37
  const hooks = ((await nitroApp.fetch(req)) as any).crossws as Partial<WebSocketHooks>;
  return hooks || {};
}

const nitroApp = useNitroApp();
let _fetch = nitroApp.fetch;

if (import.meta._websocket) {
  const { handleUpgrade } = wsAdapter({ resolve: resolveWebsocketHooks });
  _fetch = (req: ServerRequest) => {
    if (req.headers.get("upgrade") === "websocket") {
      return handleUpgrade(req, req.ip ? { remoteAddr: { hostname: req.ip } } : {});
    }
    return nitroApp.fetch(req);
  };
}

const _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");

serve({
  port: Number.isNaN(_parsedPort) ? 3000 : _parsedPort,
  hostname: process.env.NITRO_HOST || process.env.HOST,
  fetch: _fetch
});
