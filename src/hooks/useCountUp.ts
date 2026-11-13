import { useEffect, useRef, useState } from "react";

/** Zählt sanft von der vorherigen zur neuen Zahl hoch (respektiert „Bewegung reduzieren“). */
export function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    if (reduced || from === value) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (value - from) * eased);
      fromRef.current = next;
      setDisplay(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return display;
}
