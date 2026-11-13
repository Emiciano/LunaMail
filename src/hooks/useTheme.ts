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

let lastPointer: { x: number; y: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", (event) => { lastPointer = { x: event.clientX, y: event.clientY }; }, { capture: true, passive: true });
}

export function applyThemeClasses(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark", "theme-silver");
  root.classList.add(`theme-${theme}`);
  root.classList.toggle("dark", theme !== "light");
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => { ready: Promise<void> } };

/** Wechselt das Design mit einer runden Einblendung ab der letzten Klickposition. */
export function transitionTheme(theme: ThemeMode, update: () => void) {
  const doc = document as ViewTransitionDocument;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduced) {
    update();
    return;
  }
  const x = lastPointer?.x ?? window.innerWidth / 2;
  const y = lastPointer?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = doc.startViewTransition(() => {
    applyThemeClasses(theme);
    update();
  });
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" }
    );
  }).catch(() => undefined);
}

export function useTheme(theme: ThemeMode, accentColor: AccentColor, fontSize = 16) {
  useEffect(() => {
    const root = document.documentElement;
    applyThemeClasses(theme);
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
