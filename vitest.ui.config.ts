import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  test: {
    root: __dirname,
    include: [
      "tests/ui/**/*.spec.ts",
      "tests/ui/**/*.spec.tsx"
    ],
    exclude: ["tests/e2e/**", "tests/.removed/**"],
    environment: "jsdom",
    setupFiles: ["tests/ui/setup.ts"],
    globals: false
  },
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react"
  }
});
