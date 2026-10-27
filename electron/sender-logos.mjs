import { nativeImage } from "electron";
import dns from "node:dns/promises";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

/**
 * Logos der Absender statt Initialen, wie in der Android-App (SenderLogos.kt).
 * Für die Domain der Absenderadresse wird das Touch-Icon der Website geladen, sonst ein
 * angegebenes Icon der Startseite, zuletzt das Favicon über DuckDuckGo. Das Ergebnis wird
 * neu als PNG kodiert und auf der Platte zwischengespeichert. Freemail-Adressen bekommen
 * kein Logo, dort steht eine Person dahinter.
 */

const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com", "web.de", "outlook.com",
  "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com", "yahoo.com", "yahoo.de", "ymail.com",
  "icloud.com", "me.com", "mac.com", "t-online.de", "aol.com", "aol.de", "posteo.de", "posteo.net", "mail.de",
  "freenet.de", "proton.me", "protonmail.com", "pm.me", "online.de", "arcor.de", "vodafone.de", "mailbox.org",
  "tutanota.com", "tuta.io", "zoho.com", "yandex.com", "mail.ru"
]);
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "or", "ne", "gv"]);
const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 1024 * 1024;
const MAX_HTML_BYTES = 300_000;
const TIMEOUT_MS = 6000;
const GOOD_SIZE = 96;
const MIN_SIZE = 48;
const OUT_SIZE = 128;
const MAX_PARALLEL = 4;

/** Registrierbare Domain der Adresse oder null für Privat- und ungültige Adressen. */
export function logoDomainOf(address) {
  const host = String(address ?? "").split("@").pop()?.trim().replace(/>+$/, "").toLowerCase() ?? "";
  if (!DOMAIN_PATTERN.test(host)) return null;
  const labels = host.split(".");
  const keep = labels.length >= 3 && labels.at(-1).length === 2 && SECOND_LEVEL.has(labels.at(-2)) ? 3 : 2;
  const domain = labels.slice(-keep).join(".");
  return FREEMAIL.has(domain) ? null : domain;
}

export class SenderLogos {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.memory = new Map();
    this.pending = new Map();
    this.active = 0;
    this.queue = [];
  }

  /** Data-URL des Logos für die Absenderadresse oder null. */
  async get(address) {
    const domain = logoDomainOf(address);
    if (!domain) return null;
    if (this.memory.has(domain)) return this.memory.get(domain);
    if (!this.pending.has(domain)) {
      const job = this.limited(() => this.load(domain))
        .catch(() => null)
        .then((result) => {
          this.memory.set(domain, result);
          this.pending.delete(domain);
          return result;
        });
      this.pending.set(domain, job);
    }
    return this.pending.get(domain);
  }

  async limited(task) {
    if (this.active >= MAX_PARALLEL) await new Promise((resolve) => this.queue.push(resolve));
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }

  async load(domain) {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const file = path.join(this.cacheDir, `${domain}.png`);
    const none = path.join(this.cacheDir, `${domain}.none`);
    const cached = await fs.readFile(file).catch(() => null);
    if (cached) return toDataUrl(cached);
    const missing = await fs.stat(none).catch(() => null);
    if (missing && Date.now() - missing.mtimeMs < RETRY_MS) return null;

    const png = await fetchLogo(domain);
    if (!png) {
      await fs.writeFile(none, "").catch(() => undefined);
      return null;
    }
    await fs.writeFile(file, png).catch(() => undefined);
    await fs.rm(none, { force: true }).catch(() => undefined);
    return toDataUrl(png);
  }
}

function toDataUrl(png) {
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function fetchLogo(domain) {
  const fixed = [
    `https://${domain}/apple-touch-icon.png`,
    `https://www.${domain}/apple-touch-icon.png`,
    `https://${domain}/apple-touch-icon-precomposed.png`
  ];
  const candidates = [...fixed, ...(await declaredIcons(domain)), `https://icons.duckduckgo.com/ip3/${domain}.ico`];
  let fallback = null;
  for (const url of candidates) {
    const image = await decode(url);
    if (!image) continue;
    const { width, height } = image.getSize();
    if (width >= GOOD_SIZE && height >= GOOD_SIZE) return prepare(image);
    if (!fallback || width > fallback.getSize().width) fallback = image;
  }
  // Winzige Favicons würden hochskaliert nur verschwimmen; dann lieber die Initialen.
  const size = fallback?.getSize();
  return size && size.width >= MIN_SIZE && size.height >= MIN_SIZE ? prepare(fallback) : null;
}

async function decode(url) {
  const response = await safeFetch(url, MAX_BYTES);
  if (!response) return null;
  const type = response.type;
  if (type.includes("svg") || (!type.startsWith("image/") && !url.endsWith(".ico"))) return null;
  const image = nativeImage.createFromBuffer(response.body);
  return image.isEmpty() ? null : image;
}

/** Icons, die die Startseite per <link rel="…icon…"> angibt, größte zuerst (nur https). */
async function declaredIcons(domain) {
  const page = await safeFetch(`https://${domain}/`, MAX_HTML_BYTES, true);
  if (!page || !page.type.includes("html")) return [];
  const html = page.body.toString("utf8");
  const icons = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attr(tag, "rel")?.toLowerCase();
    if (!rel || !rel.includes("icon") || rel.includes("mask")) continue;
    const href = attr(tag, "href")?.replaceAll("&amp;", "&").trim();
    if (!href || /\.svg($|\?)/i.test(href)) continue;
    let url;
    try {
      url = new URL(href, page.url);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    const size = Number.parseInt(attr(tag, "sizes") ?? "", 10) || (rel.includes("apple") ? 180 : 32);
    icons.push({ url: url.toString(), size });
  }
  const seen = new Set();
  return icons
    .filter((icon) => !seen.has(icon.url) && seen.add(icon.url))
    .sort((a, b) => b.size - a.size)
    .slice(0, 4)
    .map((icon) => icon.url);
}

function attr(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? match[2] ?? match[3] ?? match[4] : undefined;
}

/**
 * Lädt nur über https, nur von öffentlichen Adressen (keine Anfragen ins lokale Netz),
 * mit Zeitlimit und Größenlimit. Weiterleitungen werden einzeln geprüft.
 */
async function safeFetch(url, maxBytes, allowPartial = false) {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    let parsed;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
    if (!(await isPublicHost(parsed.hostname))) return null;
    let response;
    try {
      response = await fetch(parsed, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "LunaMail", Accept: "image/*,text/html;q=0.8" }
      });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) return null;
      current = new URL(location, parsed).toString();
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    const body = await readLimited(response, maxBytes, allowPartial);
    if (!body) return null;
    return { url: parsed.toString(), type: (response.headers.get("content-type") ?? "").toLowerCase(), body };
  }
  return null;
}

async function readLimited(response, maxBytes, allowPartial) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes && !allowPartial) {
    await response.body.cancel().catch(() => undefined);
    return null;
  }
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        if (!allowPartial) return null;
        chunks.push(Buffer.from(value.subarray(0, value.byteLength - (total - maxBytes))));
        break;
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return null;
  }
  return Buffer.concat(chunks);
}

async function isPublicHost(hostname) {
  if (net.isIP(hostname)) return false;
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return false;
  }
  return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::" || lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8")
    || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb") || lower.startsWith("ff");
}

/** Schneidet nichts ab, macht das Bild aber quadratisch und bringt es auf eine feste Größe. */
function prepare(image) {
  const { width, height } = image.getSize();
  const side = Math.min(width, height);
  const square = width === height
    ? image
    : image.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
  return square.resize({ width: OUT_SIZE, height: OUT_SIZE, quality: "best" }).toPNG();
}
