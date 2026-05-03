import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * Vite plugin that patches html2canvas at bundle time so that
 * unsupported CSS color functions (oklch, lab, lch …) fall back
 * to transparent instead of throwing an Error.
 *
 * html2canvas v1.4.1 only supports rgb/rgba/hsl/hsla.
 * Tailwind CSS v4 uses oklch() everywhere, which crashes the
 * internal CSS parser.
 */
function patchHtml2canvasColors(): Plugin {
  return {
    name: 'patch-html2canvas-oklch',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('html2canvas')) return null;
      if (!code.includes('Attempting to parse an unsupported color function')) return null;

      // Replace the throw with a return of TRANSPARENT (0x00000000)
      const patched = code.replace(
        /throw new Error\(["']Attempting to parse an unsupported color function.*?\)/g,
        'return 0',
      );
      if (patched !== code) {
        return { code: patched, map: null };
      }
      return null;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [patchHtml2canvasColors(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ["jspdf", "html2canvas"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
