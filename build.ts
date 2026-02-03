import { walk } from "jsr:@std/fs/walk";
import { relative, extname } from "jsr:@std/path";

const inputDir = "./.output/server";
const publicDir = "./.output/public";
const outputFile = "./dist/deploy.ts";

// Read all files from the output directory
const allFiles: { path: string, content: string, mime: string }[] = [];

// Read server files
for await (const entry of walk(inputDir, { includeDirs: false })) {
  const relPath = relative(inputDir, entry.path).replace(/\\/g, "/");
  const content = await Deno.readTextFile(entry.path);
  const ext = extname(relPath);

  // Determine MIME type
  let mime = "text/plain";
  if ([".js", ".mjs"].includes(ext)) mime = "application/javascript";
  else if (ext === ".json") mime = "application/json";
  else if (ext === ".html") mime = "text/html";
  else if (ext === ".css") mime = "text/css";
  else if (ext === ".svg") mime = "image/svg+xml";

  allFiles.push({ path: relPath, content, mime });
}

// Read public files (with public/ prefix)
for await (const entry of walk(publicDir, { includeDirs: false })) {
  const relPath = "public/" + relative(publicDir, entry.path).replace(/\\/g, "/");
  const content = await Deno.readTextFile(entry.path);
  const ext = extname(relPath);

  // Determine MIME type
  let mime = "text/plain";
  if ([".js", ".mjs"].includes(ext)) mime = "application/javascript";
  else if (ext === ".json") mime = "application/json";
  else if (ext === ".html") mime = "text/html";
  else if (ext === ".css") mime = "text/css";
  else if (ext === ".svg") mime = "image/svg+xml";

  allFiles.push({ path: relPath, content, mime });
}

// Read the main entry point

console.log(`📦 Bundling ${allFiles.length} files from ${inputDir}`);

const files = allFiles.map(f => ({
  ...f,
  // Only server .mjs files are executable modules - public .js files are static assets
  isExecutable: f.mime === "application/javascript" && !f.path.startsWith("public/")
}));

const vfs = Object.fromEntries(
  files
    .filter(f => !f.isExecutable)
    .map(f => [f.path, f.content])
);

const entryPoint = "index.mjs";

// Priority Sort: Execute libs BEFORE routes, and routes BEFORE the entry point
const sortedFiles = files
  .filter(f => f.isExecutable)
  // Also filter out public client-side assets
  .filter(f => !f.path.startsWith("public/assets/"))
  .sort((a, b) => {
    if (a.path === entryPoint) return 1;
    if (b.path === entryPoint) return -1;
    if (a.path.includes("_libs")) return -1;
    if (b.path.includes("_libs")) return 1;
    if (a.path.includes("_routes")) return -1;
    if (b.path.includes("_routes")) return 1;
    return 0;
  });

console.log(`📦 Bundling ${sortedFiles.length} modules + ${Object.keys(vfs).length} static files`);

function normalizeModulePath(fromPath: string, importPath: string): string {
  // Remove leading ./ or ../
  if (importPath.startsWith("./")) {
    // Same directory import
    const dir = fromPath.substring(0, fromPath.lastIndexOf("/"));
    const result = dir ? dir + "/" + importPath.substring(2) : importPath.substring(2);
    return result;
  } else if (importPath.startsWith("../")) {
    // Parent directory import
    let path = fromPath;
    let impPath = importPath;
    while (impPath.startsWith("../")) {
      path = path.substring(0, path.lastIndexOf("/"));
      impPath = impPath.substring(3);
    }
    return path.substring(0, path.lastIndexOf("/") + 1) + impPath;
  }
  return importPath;
}

const executableBlocks = sortedFiles.map(file => {
  let code = file.content;
  const moduleExports: string[] = [];

  // Transform imports
  code = code.replace(
    /import\s+(?:(?:\*\s+as\s+(\w+))|(?:\{([^}]+)\})|(\w+))\s+from\s+['"]([^'"]+)['"];?/g,
    (match, starAs, namedImports, defaultImport, importPath) => {
      // Handle node: imports - map to polyfills
      if (importPath.startsWith("node:")) {
        const moduleName = importPath.replace("node:", "");
        const polyfillMap: Record<string, string> = {
          "fs": "node_fs",
          "url": "node_url",
          "path": "node_path"
        };
        const polyfill = polyfillMap[moduleName];

        if (polyfill) {
          if (starAs) return `const ${starAs} = ${polyfill};`;
          if (defaultImport) return `const ${defaultImport} = ${polyfill};`;
          if (namedImports) {
            // Map named imports to polyfill properties
            const imports = namedImports.split(",").map((imp: string) => {
              const trimmed = imp.trim();
              if (trimmed.includes(" as ")) {
                const [original, alias] = trimmed.split(/\s+as\s+/);
                return `${original.trim()}: ${alias.trim()}`;
              }
              return trimmed;
            }).join(", ");
            return `const { ${imports} } = ${polyfill};`;
          }
        }
        // Fallback for unknown node: modules
        if (starAs) return `const ${starAs} = {};`;
        if (defaultImport) return `const ${defaultImport} = {};`;
        if (namedImports) {
          const names = namedImports.split(",").map((n: string) => {
            const parts = n.trim().split(/\s+as\s+/);
            return parts.length > 1 ? parts[1] : parts[0];
          });
          return `const { ${names.join(", ")} } = {};`;
        }
        return "";
      }

      // Normalize relative paths
      const normalizedPath = normalizeModulePath(file.path, importPath);

      if (starAs) {
        return `const ${starAs} = __MODS__["${normalizedPath}"] || {};`;
      } else if (namedImports) {
        // Handle named imports with aliases: { a as b, c }
        const imports = namedImports.split(",").map((imp: string) => {
          const trimmed = imp.trim();
          if (trimmed.includes(" as ")) {
            const [original, alias] = trimmed.split(/\s+as\s+/);
            return `${original.trim()}: ${alias.trim()}`;
          }
          return trimmed;
        }).join(", ");
        return `const { ${imports} } = __MODS__["${normalizedPath}"] || {};`;
      } else if (defaultImport) {
        return `const ${defaultImport} = (__MODS__["${normalizedPath}"] || {}).default;`;
      }
      return match;
    }
  );

  // Transform dynamic imports: import("./path") → Promise.resolve(__MODS__["path"])
  code = code.replace(/import\s*\(\s*["']([^"']+)["']\s*\)/g, (match, importPath) => {
    if (importPath.startsWith("node:")) {
      // Keep node: imports as-is (shouldn't happen in lazy handlers)
      return match;
    }
    const normalizedPath = normalizeModulePath(file.path, importPath);
    return `Promise.resolve(__MODS__["${normalizedPath}"])`;
  });

  // Collect named exports
  code = code.replace(/^export\s+\{([^}]+)\};?$/gm, (_, exports) => {
    const exportList = exports.split(",").map((e: string) => {
      const trimmed = e.trim();
      if (trimmed.includes(" as ")) {
        const [original, alias] = trimmed.split(/\s+as\s+/);
        if (alias.trim() === "default") {
          return `default: ${original.trim()}`;
        }
        return `${alias.trim()}: ${original.trim()}`;
      }
      return `${trimmed}: ${trimmed}`;
    });
    moduleExports.push(...exportList);
    return "";
  });

  // Handle export default
  let hasDefaultExport = false;
  code = code.replace(/^export\s+default\s+/gm, () => {
    hasDefaultExport = true;
    return "__DEFAULT_EXPORT__ = ";
  });

  // Handle named export declarations (export const, export function, etc.)
  code = code.replace(/^export\s+(const|let|var|function|class)\s+(\w+)/gm, (_, keyword, name) => {
    moduleExports.push(`${name}: ${name}`);
    return `${keyword} ${name}`;
  });

  // Build the module registration
  let moduleRegistration = "";
  if (hasDefaultExport || moduleExports.length > 0) {
    const parts: string[] = [];
    if (hasDefaultExport) parts.push("default: __DEFAULT_EXPORT__");
    parts.push(...moduleExports);
    moduleRegistration = `\n__MODS__["${file.path}"] = { ${parts.join(", ")} };`;
  }

  return `
/* Module: ${file.path} */
(function() {
  let __DEFAULT_EXPORT__;
  ${code}${moduleRegistration}
})();`;
}).join("\n");

// Post-process: Wrap the top-level serve() call (from index.mjs) to skip it in Bunny Edge
// This is the call that looks like: serve({ port, hostname, tls, fetch })
let executableBlocksProcessed = executableBlocks.replace(
  /(const nitroApp = useNitroApp\(\);[\s\S]*?let _fetch = nitroApp\.fetch;[\s\S]*?)(serve\(\{[\s\S]*?fetch: _fetch[\s\S]*?\}\);)/,
  `$1if (!globalThis.__BUNNY_EDGE__) {
  $2
}`
);

// Remove trapUnhandledErrors() call - Bunny's frozen process object can't handle it
// This removes the standalone call, but keeps the function definition (harmless if not called)
executableBlocksProcessed = executableBlocksProcessed.replace(
  /\ntrapUnhandledErrors\(\);/,
  ""
);

const template = `/**
 * Bunny Edge Deployment Bundle
 * Generated from Nitro server build
 *
 * This file bundles:
 * - ${sortedFiles.length} JavaScript modules
 * - ${Object.keys(vfs).length} static files (embedded in VFS)
 */

// === BUNNY EDGE QUICK START (< 500ms startup limit) ===

// Wrap all initialization in a function so we can call Bunny.v1.serve FIRST
function initializeApp() {

const __MODS__ = {};
const VFS = ${JSON.stringify(vfs)};

// === NODE.JS POLYFILLS ===

// These MUST be defined first so they're available when modules load

const node_fs = {
  promises: {
    readFile: async (filepath) => {
      let path = String(filepath).replace(/\\\\/g, "/");

      // Normalize: remove absolute paths and resolve ../ patterns
      path = path.replace(/^[A-Za-z]:/, "").replace(/^.*\\/dist\\/\\.\\.\\//,"");

      // Check VFS with exact match first
      if (VFS[path]) return VFS[path];

      // Search by partial matching
      const filename = path.split("/").pop();
      for (const [key, content] of Object.entries(VFS)) {
        if (key === path || key.endsWith(path) || (path.includes(key) && key.length > 10)) {
          return content;
        }
      }

      // Last resort: match by filename
      for (const [key, content] of Object.entries(VFS)) {
        if (key.endsWith("/" + filename)) return content;
      }

      throw new Error(\`File not found in VFS: \${filepath} (normalized: \${path})\`);
    },
    access: async () => undefined,
    stat: async () => ({ isDirectory: () => false, isFile: () => true })
  },
  readFileSync: (filepath) => {
    let path = String(filepath).replace(/\\\\/g, "/");
    path = path.replace(/^[A-Za-z]:/, "").replace(/^.*\\/dist\\/\\.\\.\\//,"");

    if (VFS[path]) return VFS[path];

    const filename = path.split("/").pop();
    for (const [key, content] of Object.entries(VFS)) {
      if (key === path || key.endsWith(path) || (path.includes(key) && key.length > 10)) {
        return content;
      }
    }

    for (const [key, content] of Object.entries(VFS)) {
      if (key.endsWith("/" + filename)) return content;
    }

    throw new Error(\`File not found in VFS: \${filepath} (normalized: \${path})\`);
  }
};

const node_url = {
  fileURLToPath: (url) => {
    const str = String(url);
    // Handle both file:/// and file:// and regular paths
    return str.replace(/^file:\\/\\/\\//, "/").replace(/^file:\\/\\//, "/");
  },
  pathToFileURL: (path) => \`file://\${path}\`
};

const node_path = {
  dirname: (p) => {
    if (!p) return ".";
    const path = String(p).replace(/\\\\/g, "/");
    const lastSlash = path.lastIndexOf("/");
    return lastSlash <= 0 ? "/" : path.substring(0, lastSlash);
  },
  resolve: (...paths) => {
    let result = "";
    for (const p of paths) {
      if (!p) continue;
      const path = String(p).replace(/\\\\/g, "/");
      if (path.startsWith("/")) result = path;
      else result = result ? result + "/" + path : path;
    }
    return result.replace(/\\/\\/+/g, "/") || "/";
  },
  join: (...paths) => paths.filter(Boolean).join("/").replace(/\\/\\/+/g, "/"),
  basename: (p) => String(p).split("/").pop() || ""
};

// === SIMPLE SERVE WRAPPER ===

// Create a simple serve() wrapper that works in both Deno and Bunny
const serve = function(options) {
  if (typeof Bunny !== "undefined" && Bunny.v1?.serve) {
    // Bunny Edge: extract the fetch handler
    return Bunny.v1.serve(options.fetch || options);
  } else {
    // Local Deno: use Deno.serve
    return globalThis.Deno.serve(options);
  }
};

// === GLOBAL SETUP ===

globalThis.__nitro_main__ = "file:///server/index.mjs";
// Create an extensible process object using Proxy to capture any property assignments
globalThis.process = globalThis.process || new Proxy({ env: {}, on: () => {} }, {
  set(target, prop, value) {
    // Allow Deno to set internal properties silently
    target[prop] = value;
    return true;
  }
});
globalThis.__BUNNY_EDGE__ = typeof Bunny !== "undefined";

${executableBlocksProcessed}

console.log("✅ Modules loaded");

// Return the fetch handler from nitroApp for Bunny
return globalThis.__nitro__?.default?.fetch || ((req) => new Response("App not initialized", { status: 500 }));
}

// === STARTUP LOGIC ===

if (typeof Bunny !== "undefined" && Bunny.v1?.serve) {
  // BUNNY EDGE: Call serve() immediately, lazy-init on first request
  let _handler = null;

  Bunny.v1.serve(async (req) => {
    if (!_handler) {
      console.log("🐰 Bunny Edge: Lazy-initializing app on first request");
      _handler = initializeApp();
    }
    return _handler(req);
  });

  console.log("🐰 Bunny Edge: Server registered (will initialize on first request)");
} else {
  // LOCAL DENO: Initialize immediately
  initializeApp();
}
`;

await Deno.writeTextFile(outputFile, template);
const fileSize = (await Deno.stat(outputFile)).size;
console.log(`✅ Bundle created: ${outputFile} (${(fileSize / 1024).toFixed(1)} KB)`);
