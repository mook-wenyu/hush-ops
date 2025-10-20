import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "src/ui/pages/.removed/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json"
      }
    },
    rules: {
      "no-console": "off",
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": ["warn", { "ts-expect-error": "allow-with-description" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    files: ["src/ui/**/*.ts", "src/ui/**/*.tsx", "tests/ui/**/*.ts", "tests/ui/**/*.tsx"],
    plugins: {
      "react-hooks": reactHooks
    },
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.ui.json"
      }
    },
    rules: {
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": ["warn", { "ts-expect-error": "allow-with-description" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
      ],
      // React Hooks 基线 + Compiler 驱动的依赖校验
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // 跨域边界约束：组件层禁止绕过 services 门面直引 core/http
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            "src/ui/services/core/*",
            "../services/core/*",
            "**/services/core/*"
          ]
        }
      ]
    }
  }
);
