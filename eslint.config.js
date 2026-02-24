import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ["**/dist/", "**/node_modules/", "fixtures/", "**/*.min.js"],
  },
  {
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "warn",
    },
  },
  // Cloudflare Worker globals
  {
    files: ["apps/api-worker/**/*.js"],
    languageOptions: {
      globals: {
        fetch: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        Response: "readonly",
        Request: "readonly",
        URL: "readonly",
        Headers: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  // Chrome extension globals
  {
    files: ["apps/chrome-extension/**/*.js"],
    languageOptions: {
      globals: {
        chrome: "readonly",
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        console: "readonly",
        CustomEvent: "readonly",
        MutationObserver: "readonly",
        XMLHttpRequest: "readonly",
        Node: "readonly",
        location: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "no-empty": "off",
    },
  },
  // Browser globals for web app
  {
    files: ["apps/web-app/**/*.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        console: "readonly",
        File: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        URL: "readonly",
        Blob: "readonly",
        alert: "readonly",
        XMLHttpRequest: "readonly",
        Node: "readonly",
        location: "readonly",
      },
    },
  },
];
