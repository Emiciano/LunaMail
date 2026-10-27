# Desktop-Design

Die Desktop-App nutzt dasselbe Design wie die Android-App (`android/.../ui/theme/Theme.kt`):
neutrale Flächen, Schwarz bzw. Weiß als Akzent, Inter für Text und Inter Tight für Titel.

## Designs

| Token | Hell | Dunkel | Silber | Verwendung |
|---|---|---|---|---|
| `canvas` | `#FFFFFF` | `#000000` | `#2D2E32` | Hintergrund von Liste und Leseansicht |
| `sidebar` | `#F6F6F6` | `#0A0A0A` | `#26272B` | Seitenleiste |
| `surface` / `surface-2` | `#F3F3F3` / `#E8E8E8` | `#161616` / `#232323` | `#3E3F43` / `#4B4C50` | Karten, Suchfeld, Chips, ausgewählte Zeile |
| `line` | `#ECECEC` | `#222222` | `#3D3E42` | Trennlinien |
| `ink` | `#000000` | `#FFFFFF` | `#F3F3F5` | Text, Symbole, Standard-Akzent |
| `label-2` / `label-3` | `#5E5E5E` / `#9E9E9E` | `#A6A6A6` / `#6B6B6B` | `#ADAFB4` / `#7E8086` | Sekundär- und Tertiärtext |

Die Werte stehen in `src/styles.css` als RGB-Tripel und sind in `tailwind.config.js` als Farben
eingetragen (`bg-surface`, `text-label-2`, `bg-ink/[0.06]` …). Feste Hex-Farben in Komponenten
bitte vermeiden, damit alle drei Designs funktionieren.

## Screenshots

`npx vite --port 5199` starten und dann `node scripts/screenshots/capture.mjs docs/design/screenshots`
ausführen. Das Skript lädt die Oberfläche mit Demo-Daten (`scripts/screenshots/mock-bridge.js`).
