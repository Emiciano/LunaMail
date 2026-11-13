// Spam-Schutz: bewertet neue Mails lokal anhand von Absender und Kopfzeilen.
// Es wird nichts an externe Dienste gesendet.

const VOWELS = new Set(["a", "e", "i", "o", "u", "y", "ä", "ö", "ü"]);
// Typische zweiteilige Länder-Endungen, damit „firma.co.uk“ als Domain erkannt wird.
const SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "ac", "edu", "or", "ne", "go"]);

/** Registrierbare Domain, z. B. „s.sellluna.com“ → „sellluna.com“. */
export function baseDomain(domain) {
  const labels = String(domain || "").toLowerCase().split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  const take = tld.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-take).join(".");
}

/** Wirkt der Teil vor dem @ wie zufällig erzeugt (z. B. „lrhrlknbx“)? */
export function looksRandom(localPart) {
  const local = String(localPart || "").toLowerCase();
  // Häufige Buchstabengruppen zählen als ein Laut, damit „schwarz“ nicht auffällt.
  const letters = local.replace(/[^a-zäöü]/g, "").replace(/sch|ch|ck|ph|th|qu/g, "a");
  if (letters.length < 8) return false;
  const vowelCount = [...letters].filter((char) => VOWELS.has(char)).length;
  const vowelRatio = vowelCount / letters.length;
  let run = 0;
  let longestRun = 0;
  for (const char of letters) {
    run = VOWELS.has(char) ? 0 : run + 1;
    longestRun = Math.max(longestRun, run);
  }
  const digitMix = /[a-z]\d{3,}[a-z]|\d[a-z]+\d/.test(local) && local.length >= 12;
  return vowelRatio < 0.3 || longestRun >= 5 || digitMix;
}

function authFailures(rawHeaders) {
  const text = String(rawHeaders || "").toLowerCase();
  const failures = [];
  for (const method of ["spf", "dkim", "dmarc"]) {
    if (new RegExp(`\\b${method}=(fail|softfail|permerror)`).test(text)) failures.push(method.toUpperCase());
  }
  return failures;
}

/**
 * Bewertet einen Absender. `known` ist true für Kontakte, Empfänger eigener Mails
 * und Absender, die der Nutzer als „Kein Spam“ markiert hat.
 */
export function assessSpam({ sender, address, rawHeaders = "", known = false }) {
  if (known || !address) return { spam: false, score: 0, reasons: [] };
  const [local, domain = ""] = address.split("@");
  const reasons = [];
  let score = 0;
  const headers = String(rawHeaders || "");

  if (/^x-spam-flag:\s*yes/im.test(headers) || /^x-spam-status:\s*yes/im.test(headers)) {
    score += 3;
    reasons.push("Vom Mailserver als Spam markiert");
  }
  const failures = authFailures(headers);
  if (failures.length) {
    score += failures.length >= 2 ? 3 : 2;
    reasons.push(`Echtheitsprüfung fehlgeschlagen (${failures.join(", ")})`);
  }
  if (looksRandom(local)) {
    score += 2;
    reasons.push("Absenderadresse wirkt zufällig erzeugt");
  }
  const sub = domain.slice(0, Math.max(0, domain.length - baseDomain(domain).length - 1));
  if (sub && sub.split(".").some((label) => label.length <= 2 || looksRandom(label))) {
    score += 1;
    reasons.push("Ungewöhnliche Unterdomain");
  }
  const displayName = String(sender || "").replace(/<[^>]*>/g, "").replace(/["']/g, "").trim().toLowerCase();
  if (displayName && displayName !== address && /@/.test(displayName) && !displayName.includes(address)) {
    score += 2;
    reasons.push("Anzeigename täuscht eine andere Adresse vor");
  }
  if (!displayName || displayName === address || displayName === local) {
    score += 1;
    reasons.push("Kein Absendername");
  }
  return { spam: score >= 3, score, reasons };
}
