import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const UI_ROOT = resolve(__dirname, "src/ui");

export default defineConfig({
  root: UI_ROOT,
  plugins: [tailwindcss(), react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/api")
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  },
  build: {
    outDir: resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
    sourcemap: true
  }
});
