import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";

export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      },
    },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: ["src/screens/**", "src/components/**"],
              from: "src/storage/**",
              message: "storage는 store를 경유해야 합니다 (queries.ts / mutation 메서드).",
            },
            {
              target: "src/store/**",
              from: ["src/screens/**", "src/components/**"],
              message: "store는 screens/components를 import할 수 없습니다 (상향 import 금지).",
            },
            {
              target: "src/domain/**",
              from: ["src/screens/**", "src/components/**", "src/store/**", "src/storage/**"],
              message: "domain은 순수해야 합니다 — screens/store/storage import 금지.",
            },
          ],
        },
      ],
    },
  },
];
