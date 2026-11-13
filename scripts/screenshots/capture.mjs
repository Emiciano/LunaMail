// Erstellt Design-Screenshots der Desktop-Oberfläche mit Demo-Daten.
// Aufruf: npx vite --port 5199 & node scripts/screenshots/capture.mjs [ausgabeordner]
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Playwright ist keine Projekt-Abhängigkeit; require findet auch eine global installierte Version.
const { chromium } = createRequire(import.meta.url)("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? "screenshots");
const baseUrl = process.env.PREVIEW_URL ?? "http://localhost:5199/";
const themes = (process.env.THEMES ?? "light,dark,silver").split(",");
const mockBridge = await readFile(path.join(here, "mock-bridge.js"), "utf8");

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();

for (const theme of themes) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await page.addInitScript(mockBridge);
  await page.goto(`${baseUrl}?theme=${theme}`);
  await page.waitForSelector("#boot-splash", { state: "detached" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${theme}-dashboard.png`) });

  await page.getByRole("button", { name: /Systemstatus/ }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${theme}-systemstatus.png`) });

  await page.getByRole("button", { name: /Emilio/ }).first().click();
  await page.getByRole("button", { name: /Posteingang/ }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${theme}-posteingang.png`) });

  await page.getByText("Drehplan für Freitag").first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${theme}-nachricht.png`) });

  // Schnellantwort und „Später erinnern“ im Lesefenster.
  await page.getByPlaceholder(/Antwort an/).click();
  await page.keyboard.type("Danke Lena, passt perfekt. Ich bin um 8 Uhr da.");
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, `${theme}-schnellantwort.png`) });
  await page.getByPlaceholder(/Antwort an/).fill("");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.getByText("Drehplan für Freitag").first().click().catch(() => undefined);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Später erinnern" }).last().click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outDir, `${theme}-erinnern-menue.png`) });
  await page.getByText("Morgen früh").first().click();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(outDir, `${theme}-rueckgaengig.png`) });
  await page.keyboard.press("Escape");

  // Newsletter abbestellen und Blockieren.
  await page.getByText("Black Week").first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${theme}-newsletter.png`) });
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${theme}-newsletter-abmelden.png`) });
  await page.getByRole("alertdialog").getByRole("button", { name: "Abmelden" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${theme}-newsletter-abgemeldet.png`) });
  await page.getByTitle("Absender blockieren").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${theme}-blockieren.png`) });
  await page.getByRole("alertdialog").getByRole("button", { name: "Blockieren" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${theme}-blockiert.png`) });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Erinnerungen/ }).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${theme}-erinnerungen.png`) });
  await page.getByRole("button", { name: /Posteingang/ }).first().click();
  await page.waitForTimeout(300);

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${theme}-befehle.png`) });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+?");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${theme}-tastenkuerzel.png`) });
  await page.keyboard.press("Escape");

  await page.keyboard.press("n");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${theme}-verfassen.png`) });
  await page.getByTitle("Schließen").last().click().catch(() => undefined);
  await page.getByRole("button", { name: "Einstellungen" }).last().click();
  await page.getByRole("button", { name: "Allgemein", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText("Schreiben", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, `${theme}-einstellungen-schreiben.png`) });
  await page.getByRole("button", { name: "Blockiert", exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${theme}-einstellungen-blockiert.png`) });
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${theme}-einstellungen.png`) });
  await page.close();
}

await browser.close();
console.log(`Screenshots in ${outDir}`);
