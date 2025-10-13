import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
import daisyui from "daisyui";

const night = (require("daisyui/src/theming/themes") as Record<string, Record<string, string>>)[
  "[data-theme=night]"
];

export default {
  content: [
    "./index.html",
    "./src/ui/**/*.{ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#8c4bff",
          surface: "#201e33",
          accent: "#38c95d",
          warning: "#ffd859",
          danger: colors.rose[500]
        }
      }
    }
  },
  daisyui: {
    themes: [
      {
        hush: {
          ...night,
          primary: "#8c4bff",
          "primary-focus": "#6f3ad6",
          "primary-content": "#ffffff",
          secondary: "#5b8cff",
          accent: "#38c95d",
          neutral: "#1c1f2b",
          "base-100": "#141722",
          "base-200": "#10131d",
          "base-300": "#0c0f17"
        }
      }
    ],
    logs: false
  },
  plugins: [daisyui]
} satisfies Config;
