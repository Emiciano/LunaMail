# Security Checklist – Pflicht für jedes Projekt

> Diese Datei gilt für alle Projekte von All Seasons Production.
> Lege sie ins Repo (z. B. als `SECURITY_CHECKLIST.md`) und verweise in `AGENTS.md` / `CLAUDE.md` darauf.
> **Jeder Coding-Agent (Codex, Claude Code usw.) muss diese Punkte bei jeder neuen Funktion, jedem Endpoint und jedem Refactor berücksichtigen und selbstständig umsetzen.**

---

## Arbeitsregeln für den Agenten

1. Bevor du eine Aufgabe als fertig meldest, prüfe die betroffenen Punkte dieser Liste.
2. Wenn ein Punkt verletzt ist, behebe ihn direkt mit – nicht nur melden.
3. Wenn ein Punkt nicht umsetzbar ist (z. B. fehlender Zugang zum Hosting), schreib es klar in deine Abschlussmeldung unter **„Offene Security-Punkte“**.
4. Nie Security abschwächen, um ein Feature schneller zum Laufen zu bringen (kein `cors: *`, kein Deaktivieren von RLS, keine Secrets im Code „nur zum Testen“).
5. Am Ende jeder größeren Aufgabe: kurze Tabelle mit ✅ / ⚠️ / ❌ für die relevanten Punkte.

---

## 1. Secrets & Konfiguration

- [ ] **Keine API-Keys im Frontend.** Alles, was im Browser-Bundle landet, ist öffentlich. Private Keys (Stripe Secret, OpenAI, ElevenLabs, DB-Passwörter, Service-Role-Keys) nur serverseitig. Im Frontend nur explizit öffentliche Keys (z. B. Stripe Publishable Key).
  - Prüfen: Build-Output (`dist/`) nach `sk_`, `secret`, `key=` durchsuchen. Vite: nur `VITE_`-Variablen landen im Client – dort nie Secrets.
- [ ] **`.env` nie in GitHub.** `.env*` in `.gitignore`, nur `.env.example` ohne echte Werte committen.
  - Wurde je ein Secret committet: Secret **rotieren** (neu erzeugen) – Löschen aus der History reicht nicht.

## 2. Authentifizierung

- [ ] **Echten Auth-Provider nutzen** (z. B. Supabase Auth, Clerk, Auth.js, Firebase Auth) – keine selbstgebaute Passwort-/Session-Logik.
- [ ] **Tokens nicht in `localStorage`.** Sessions über `httpOnly`, `Secure`, `SameSite=Lax/Strict` Cookies.
- [ ] **2FA für Admins** – jeder Account mit Admin-/Backoffice-Rechten muss 2FA haben.

## 3. Autorisierung & Datenzugriff

- [ ] **Row Level Security (RLS) einschalten** auf jeder Tabelle (Supabase/Postgres). Ohne Policy = kein Zugriff. Policies pro Tabelle für select/insert/update/delete.
- [ ] **Berechtigungen auf dem Server prüfen** – bei jedem Request: Ist der User eingeloggt? Gehört ihm die Ressource? Hat er die Rolle? Frontend-Checks (ausgeblendete Buttons) zählen nicht.
- [ ] **Keine User-IDs aus dem Browser vertrauen.** Die User-ID kommt aus der verifizierten Session/dem Token auf dem Server, nie aus Body, Query oder Header, den der Client setzt.

## 4. Eingaben & Datenbank

- [ ] **Jede Eingabe serverseitig validieren** (z. B. mit Zod/Valibot): Typ, Länge, Format, erlaubte Werte. Client-Validierung ist nur Komfort.
- [ ] **Kein Raw SQL mit User-Input.** Nur parametrisierte Queries / Query-Builder / ORM. Nie String-Konkatenation in SQL.

## 5. API & Endpoints

- [ ] **Rate Limiting auf jedem Endpoint** – besonders Login, Registrierung, Passwort-Reset, Kontaktformulare, KI-/kostenpflichtige APIs.
- [ ] **Webhook-Signaturen verifizieren** (Stripe, Meta, ElevenLabs, PayPal usw.) mit dem Signing Secret des Anbieters, bevor irgendetwas verarbeitet wird. Raw Body für die Prüfung verwenden.
- [ ] **CORS auf die eigene Domain beschränken** – kein `Access-Control-Allow-Origin: *` bei Endpoints mit Auth oder Daten.

## 6. Datei-Uploads & Storage

- [ ] **Upload-Typen und -Größen begrenzen** – Whitelist von MIME-Types/Endungen, Max-Größe serverseitig prüfen, Dateinamen neu vergeben.
- [ ] **Storage-Buckets privat** – Zugriff nur über signierte, zeitlich begrenzte URLs. Öffentlich nur, was wirklich öffentlich sein soll (z. B. Website-Bilder).

## 7. Auslieferung & Fehler

- [ ] **Security-Header aktivieren:** `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy`.
- [ ] **Stack Traces vor Usern verstecken** – in Produktion nur generische Fehlermeldungen; Details nur ins Server-Log.

## 8. Wartung & Notfall

- [ ] **Verwundbare Pakete patchen** – `npm audit` / `pnpm audit` bzw. Dependabot/Renovate; kritische und hohe Lücken vor jedem Release schließen.
- [ ] **Datenbank-Backups – und Restore testen.** Automatische Backups einrichten und mindestens einmal tatsächlich eine Wiederherstellung durchspielen. Ein Backup, das nie getestet wurde, zählt nicht.

---

## Prompt für bestehende Projekte (zum Kopieren)

```
Lies SECURITY_CHECKLIST.md im Repo-Root. Prüfe das komplette Projekt gegen jeden Punkt
der Liste. Gib mir zuerst eine Tabelle: Punkt | Status (✅/⚠️/❌) | Fundstelle (Datei/Zeile) | Fix.
Behebe danach alle ❌ und ⚠️, die du im Code beheben kannst, in kleinen, nachvollziehbaren
Commits. Punkte, die Einstellungen außerhalb des Codes brauchen (Hosting, Supabase-Dashboard,
Stripe-Dashboard, Backups), listest du am Ende unter „Offene Security-Punkte – manuell“ mit
genauer Anleitung auf. Schwäche nirgends Sicherheit ab, um etwas zum Laufen zu bringen.
```

## Zeile für AGENTS.md / CLAUDE.md (zum Kopieren)

```
Security: Halte dich bei jeder Änderung an SECURITY_CHECKLIST.md. Prüfe die relevanten Punkte
vor jeder Abschlussmeldung und liste nicht umsetzbare Punkte unter „Offene Security-Punkte“.
```
