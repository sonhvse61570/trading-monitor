import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0b0e11",
          panel: "#12161c",
          hover: "#1b212b",
          border: "#232a35",
        },
        up: "#0ecb81",
        down: "#f6465d",
        accent: "#f0b90b",
        muted: "#848e9c",
      },
      fontFamily: {
        mono: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;