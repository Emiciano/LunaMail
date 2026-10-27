/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Design-Tokens aus src/styles.css, abgestimmt auf die Android-App (Hell, Dunkel, Silber).
      colors: {
        ink: token("ink"),
        canvas: token("canvas"),
        sidebar: token("sidebar"),
        surface: { DEFAULT: token("surface"), 2: token("surface-2") },
        line: token("line"),
        label: { 2: token("label-2"), 3: token("label-3") },
        scrim: token("scrim"),
        danger: token("danger"),
        flag: token("flag")
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter Tight", "Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        panel: "0 20px 55px rgb(15 23 42 / 0.11)",
        soft: "0 12px 30px rgb(15 23 42 / 0.08)",
        float: "0 10px 30px rgb(0 0 0 / 0.12), 0 1px 3px rgb(0 0 0 / 0.08)"
      }
    }
  },
  plugins: []
};
