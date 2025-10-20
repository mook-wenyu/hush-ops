import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const UI_ROOT = resolve(__dirname, "src/ui");

export default defineConfig({
  root: UI_ROOT,
  publicDir: resolve(UI_ROOT, "public"), // 静态资源目录
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]]
      }
    })
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    open: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/api"),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, res) => {
            console.warn("[Vite Proxy Error]", err.message);
            if (!res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                error: "Backend service unavailable",
                message: "后端服务暂未就绪，请稍候刷新页面"
              }));
            }
          });
        }
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/api"),
        configure: (proxy, _options) => {
          proxy.on("error", (err, _req, res) => {
            console.warn("[Vite Proxy Error]", err.message);
            if (!res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                error: "Backend service unavailable",
                message: "后端服务暂未就绪，请稍候刷新页面"
              }));
            }
          });
        }
      }
    }
  },
  build: {
    outDir: resolve(__dirname, "dist/ui"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(UI_ROOT, "index.html")
      }
    }
  }
});
