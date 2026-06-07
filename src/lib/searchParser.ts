import type { MailQueryFilters } from "../services/mailService";

export type ParsedSearch = {
  freeText: string;
  filters: MailQueryFilters;
};

const TOKEN_RE = /(?:[^\s"]+|"[^"]*")+/g;

function normalizeValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function parseSearchQuery(input: string): ParsedSearch {
  const filters: MailQueryFilters = {};
  const freeText: string[] = [];
  const tokens = input.match(TOKEN_RE) ?? [];

  for (const token of tokens) {
    const [rawKey, ...rest] = token.split(":");
    if (!rest.length) {
      freeText.push(token);
      continue;
    }
    const value = normalizeValue(rest.join(":"));
    const key = rawKey.toLowerCase();
    if (!value) continue;

    if (key === "from") {
      filters.from = value;
    } else if (key === "to") {
      filters.to = value;
    } else if (key === "subject") {
      filters.subject = value;
    } else if (key === "has" && value.toLowerCase() === "attachment") {
      filters.hasAttachment = true;
    } else if (key === "is") {
      const normalized = value.toLowerCase();
      if (normalized === "unread") filters.unreadOnly = true;
      if (normalized === "read") filters.isRead = true;
      if (normalized === "favorite" || normalized === "starred") filters.favoriteOnly = true;
      if (normalized === "important") filters.importantOnly = true;
    } else if (key === "before") {
      filters.before = value;
    } else if (key === "after") {
      filters.after = value;
    } else {
      freeText.push(token);
    }
  }

  return { freeText: freeText.join(" ").trim(), filters };
}
