import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    root: __dirname,
    include: ["tests/**/*.spec.ts", "tests/**/*.spec.tsx"],
    // 默认 node 环境下排除 UI 测试，由 ui:ga 以 jsdom 单独运行
    exclude: ["tests/e2e/**", "tests/ui/**", "tests/.removed/**"],
    environment: "node",
    globals: false
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react"
  },
  resolve: {
    alias: {
      "@fastify/multipart": resolve(__dirname, "src/test-stubs/fastify-multipart.ts")
    }
  }
});
