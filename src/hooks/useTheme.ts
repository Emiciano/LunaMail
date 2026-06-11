import { useEffect } from "react";
import { isDesktop } from "../services/desktop";
import type { AccentColor, ThemeMode } from "../types";

const accentValues: Record<AccentColor, string> = {
  white: "255 255 255",
  blue: "37 99 235",
  orange: "234 88 12",
  purple: "147 51 234",
  teal: "13 148 136",
  pink: "219 39 119",
  red: "220 38 38",
  green: "22 163 74",
  gray: "71 85 105"
};

const accentSoftValues: Record<AccentColor, string> = {
  white: "21 21 21",
  blue: "239 246 255",
  orange: "255 247 237",
  purple: "245 243 255",
  teal: "240 253 250",
  pink: "253 242 248",
  red: "254 242 242",
  green: "240 253 244",
  gray: "248 250 252"
};

export function useTheme(theme: ThemeMode, accentColor: AccentColor) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.setProperty("--accent", accentValues[accentColor]);
    document.documentElement.style.setProperty("--accent-soft", accentSoftValues[accentColor]);
    document.documentElement.style.setProperty("--accent-contrast", accentColor === "white" ? "11 11 11" : "255 255 255");
    if (isDesktop) {
      void window.electronAPI?.window.setTheme(theme);
    }
  }, [theme, accentColor]);
}
