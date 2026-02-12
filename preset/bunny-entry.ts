import "#nitro/virtual/polyfills";
import type { ServerRequest } from "srvx";
import type { WebSocketHooks } from "h3";
import { useNitroApp } from "nitro/app";
import wsAdapter from "./ws.mjs";
import wsAdapterDeno from "crossws/adapters/deno";

const nitroApp = useNitroApp();

async function resolveWebsocketHooks(req: ServerRequest): Promise<Partial<WebSocketHooks>> {
  // https://github.com/h3js/h3/blob/c11ca743d476e583b3b47de1717e6aae92114357/src/utils/ws.ts#L37
  const hooks = ((await nitroApp.fetch(req)) as any).crossws as Partial<WebSocketHooks>;
  return hooks || {};
}

// @ts-expect-error
if (typeof Bunny !== "undefined") {
  // @ts-expect-error
  Bunny.v1.serve((req: Request): Response | Promise<Response> => {
    if (import.meta._websocket && req.headers.get("upgrade") === "websocket") {
      return wsAdapter({ resolve: resolveWebsocketHooks }).handleUpgrade(req);
    }

    return nitroApp.fetch(req);
  });
} else {
  const _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");

  // @ts-ignore
  Deno.serve(
    {
      port: Number.isNaN(_parsedPort) ? 3000 : _parsedPort,
      hostname: process.env.NITRO_HOST || process.env.HOST,
    },
    (req: Request, info: any): Response | Promise<Response> => {
      if (import.meta._websocket && req.headers.get("upgrade") === "websocket") {
        // @ts-ignore
        return wsAdapterDeno({ resolve: resolveWebsocketHooks }).handleUpgrade(req, info);
      }

      return nitroApp.fetch(req);
    }
  );
}
