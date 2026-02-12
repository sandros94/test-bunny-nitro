import "./styles.css";
import { renderToReadableStream } from "preact-render-to-string/stream";
import { App } from "./app.jsx";

import clientAssets from "./entry-client?assets=client";
import serverAssets from "./entry-server?assets=ssr";

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const htmlStream = renderToReadableStream(<Root url={url} />);

    // Create a TransformStream to inject the doctype
    const stream = htmlStream.pipeThrough(new TransformStream({
      start(controller) {
        // Prepend the doctype immediately
        controller.enqueue(new TextEncoder().encode('<!doctype html>'));
      },
      transform(chunk, controller) {
        // Pass all other chunks through unmodified
        controller.enqueue(chunk);
      }
    }));

    return new Response(stream, {
      headers: { "Content-Type": "text/html;charset=utf-8" },
    });
  },
};

function Root(_props: { url: URL }) {
  const assets = clientAssets.merge(serverAssets);
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="/vite.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vite + Nitro + Preact</title>
        {assets.css.map((attr: any) => (
          <link key={attr.href} rel="stylesheet" {...attr} />
        ))}
        {assets.js.map((attr: any) => (
          <link key={attr.href} rel="modulepreload" {...attr} />
        ))}
        <script type="module" src={assets.entry} />
      </head>
      <body>
        <div id="app">
          <App />
        </div>
      </body>
    </html>
  );
}
