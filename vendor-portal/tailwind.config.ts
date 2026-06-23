import type { Config } from "tailwindcss";

const medusaPreset = require("@medusajs/ui-preset");

const config: Config = {
  presets: [medusaPreset],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        oweg: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#00D26A",
          600: "#00BD5F",
          700: "#00B856",
          800: "#00A551",
          900: "#007a3d",
        },
      },
      backgroundImage: {
        "oweg-sidebar":
          "linear-gradient(180deg, rgba(0, 210, 106, 0.06) 0%, transparent 28%), linear-gradient(180deg, var(--bg-component) 0%, var(--bg-component) 100%)",
        "oweg-page":
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0, 210, 106, 0.08), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(0, 189, 95, 0.05), transparent 50%)",
      },
    },
  },
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@medusajs/ui/dist/**/*.{js,ts,jsx,tsx}",
  ],
};

export default config;
