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
        ocean: {
          50: "#eef9ff",
          100: "#d9f1ff",
          200: "#bce7ff",
          300: "#8ed8ff",
          400: "#59c1ff",
          500: "#32a4ff",
          600: "#1b85f5",
          700: "#146de1",
          800: "#1758b6",
          900: "#194d8f",
          950: "#142f57",
        },
        // Deep navy accent — the open-water feel for Is It Boat Day.
        navy: {
          400: "#3b6ea5",
          500: "#2a5587",
          600: "#1d3f6b",
          700: "#152e4f",
          800: "#0e2038",
          900: "#081626",
        },
      },
      backgroundImage: {
        // "Dawn over water": deep indigo top, a teal horizon glow lower-left,
        // grounding to the abyss base. Shared by the dashboard + town-list heroes
        // so the gradient is defined in exactly one place.
        "dawn-hero":
          "radial-gradient(120% 90% at 15% 105%, rgba(50,164,255,0.22), transparent 55%)," +
          "linear-gradient(165deg, #0b1f3a 0%, #0e2038 45%, #081626 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
