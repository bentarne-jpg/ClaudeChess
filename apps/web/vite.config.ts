import { defineConfig, type Plugin } from "vite";

/**
 * Content-Security-Policy (manifest S8). Added to built pages only, because the dev server injects
 * inline scripts. Stockfish needs 'wasm-unsafe-eval'; style-src allows inline style attributes the
 * legacy code sets. Add a backend origin to connect-src when one is configured.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const csp = (): Plugin => ({
  name: "csp",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace("<head>", `<head>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
});

export default defineConfig({
  // Relative paths so the same build works at /, /next/, /dev/<name>/ and /releases/<version>/.
  base: "./",
  plugins: [csp()],
  build: { target: "es2022", sourcemap: true, assetsInlineLimit: 0 },
  server: { port: 5173 },
  preview: { port: 4173 },
});
