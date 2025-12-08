// eslint.config.mjs
import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import nextConfig from "eslint-config-next";

const config = [
  // Ignore heavy / generated / workspace subfolders (adjust if needed)
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "my-medusa-store/**",
      "vendor-portal/**",
      "public/**",
      ".turbo/**",
      "src/app/example/**",
      "affiliate-portal/**",  // Separate workspace with its own build
      "oc-api/**",            // Legacy migration scripts
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript + React language options and plugin rules
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
        // If you have a tsconfig.json at repo root, this enables type-aware rules.
        // If it causes performance issues, remove `project` or point to a smaller tsconfig.
        project: "./tsconfig.json",
      },
      globals: {
        // if some global names are used across project (e.g., fetch in service workers),
        // add them here. Keep empty for now.
      },
    },

    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
    },

    settings: {
      react: { version: "detect" },
    },

    rules: {
      // prefer TS version of no-unused-vars
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],

      // turn off rules that conflict with TS or new React runtime
      "react/react-in-jsx-scope": "off",
      "no-undef": "off", // TypeScript handles defs (turn off noisy no-undef)
      "@typescript-eslint/no-require-imports": "off", // disable if old code uses require()

      "no-case-declarations": "off",

      // you can add more rule overrides here if needed
    },
  },

  // Include Next.js recommended flat config last so it can add its rules
  ...nextConfig,

  // Final overrides
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
