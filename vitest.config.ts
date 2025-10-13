import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: __dirname,
    include: ["tests/**/*.spec.ts", "tests/**/*.spec.tsx"],
    environment: "node",
    globals: false
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react"
  }
});
