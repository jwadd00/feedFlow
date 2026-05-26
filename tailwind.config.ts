import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18212f",
        field: "#f5f7f9",
        line: "#d9e1e8",
        leaf: "#2f6f4f",
        maize: "#d99a28",
        danger: "#b42318"
      }
    }
  },
  plugins: []
};

export default config;
