import { useEffect } from "react";
import { isDesktop } from "../services/desktop";
import type { AccentColor, ThemeMode } from "../types";

const accentValues: Record<AccentColor, string> = {
  white: "0 0 0",
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
  white: "243 243 243",
  blue: "239 246 255",
  orange: "255 247 237",
  purple: "245 243 255",
  teal: "240 253 250",
  pink: "253 242 248",
  red: "254 242 242",
  green: "240 253 244",
  gray: "248 250 252"
};

export function useTheme(theme: ThemeMode, accentColor: AccentColor, fontSize = 16) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark", "theme-silver");
    root.classList.add(`theme-${theme}`);
    root.classList.toggle("dark", theme !== "light");
    // „Standard“ (white) folgt dem Design: Schwarz im hellen, Weiß im dunklen Design.
    if (accentColor === "white") {
      for (const name of ["--accent", "--accent-soft", "--accent-contrast"]) root.style.removeProperty(name);
    } else {
      root.style.setProperty("--accent", accentValues[accentColor]);
      root.style.setProperty("--accent-soft", accentSoftValues[accentColor]);
      root.style.setProperty("--accent-contrast", "255 255 255");
    }
    root.style.setProperty("--app-font-size", `${Math.min(22, Math.max(12, fontSize))}px`);
    if (isDesktop) {
      void window.electronAPI?.window.setTheme(theme);
    }
  }, [theme, accentColor, fontSize]);
}
