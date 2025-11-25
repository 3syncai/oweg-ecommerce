import type { Config } from "tailwindcss";

const medusaPreset = require("@medusajs/ui-preset");

const config: Config = {
  presets: [medusaPreset],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@medusajs/ui/dist/**/*.{js,ts,jsx,tsx}",
  ],
};

export default config;

