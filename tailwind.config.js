/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        panel: "0 20px 55px rgb(15 23 42 / 0.11)",
        soft: "0 12px 30px rgb(15 23 42 / 0.08)"
      }
    }
  },
  plugins: []
};
