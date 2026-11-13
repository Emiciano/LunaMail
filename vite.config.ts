import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Content-Security-Policy für die ausgelieferte App (nur im Build: der Dev-Server braucht Inline-Skripte für HMR).
// Mails werden in einem Sandbox-iframe ohne Skripte gezeigt; externe Bilder nur per HTTPS und nur nach Freigabe.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'none'"
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "lunamail-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`
      );
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  clearScreen: false,
  server: {
    strictPort: true,
    port: 1420
  },
  envPrefix: ["VITE_"]
});
