import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/ui/**/*.{ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {}
  }
} satisfies Config;
