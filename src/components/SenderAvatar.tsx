import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { useMailStore } from "../stores/mailStore";

// Ergebnisse je Adresse für die ganze Sitzung; der Hauptprozess cacht zusätzlich auf der Platte.
const logoCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function loadLogo(address: string): Promise<string | null> {
  const bridge = window.electronAPI;
  if (!bridge?.senderLogo) return Promise.resolve(null);
  let job = pending.get(address);
  if (!job) {
    job = bridge.senderLogo(address)
      .then((logo) => (typeof logo === "string" && logo.startsWith("data:image/png;base64,") ? logo : null))
      .catch(() => null)
      .then((logo) => {
        logoCache.set(address, logo);
        pending.delete(address);
        return logo;
      });
    pending.set(address, job);
  }
  return job;
}

/** E-Mail-Adresse aus „Name <adresse>“ oder einer reinen Adresse. */
export function addressOf(value: string) {
  const first = value.split(",")[0] ?? "";
  return (first.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? first.match(/[^\s<>"',;]+@[^\s<>"',;]+/)?.[0] ?? "").toLowerCase();
}

export function initialsOf(name: string) {
  const parts = name.replace(/<[^>]*>/g, "").split(/[\s._-]+/).filter((part) => /\p{L}/u.test(part.charAt(0)));
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  return letters || name.charAt(0).toUpperCase() || "?";
}

/** Rundes Absender-Bild: Firmenlogo, wenn es eins gibt, sonst Initialen. */
export function SenderAvatar({ address, name, className }: { address: string; name: string; className?: string }) {
  const enabled = useMailStore((state) => state.settings.senderLogos !== false);
  const key = addressOf(address);
  const [logo, setLogo] = useState<string | null>(() => logoCache.get(key) ?? null);

  useEffect(() => {
    if (!enabled || !key) {
      setLogo(null);
      return;
    }
    if (logoCache.has(key)) {
      setLogo(logoCache.get(key) ?? null);
      return;
    }
    let active = true;
    void loadLogo(key).then((next) => {
      if (active) setLogo(next);
    });
    return () => {
      active = false;
    };
  }, [enabled, key]);

  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2A2A2A] font-semibold text-white", className)}>
      {initialsOf(name)}
      {logo ? <img src={logo} alt="" draggable={false} className="logo-fade-in absolute inset-0 h-full w-full bg-white object-cover" /> : null}
    </span>
  );
}
