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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(mockBridge);
  await page.goto(`${baseUrl}?theme=${theme}`);
  await page.waitForSelector("#boot-splash", { state: "detached" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${theme}-dashboard.png`) });

  await page.getByRole("button", { name: /Emilio/ }).first().click();
  await page.getByRole("button", { name: /Posteingang/ }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${theme}-posteingang.png`) });

  await page.getByText("Drehplan für Freitag").first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${theme}-nachricht.png`) });

  await page.keyboard.press("n");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `${theme}-verfassen.png`) });
  await page.keyboard.press("Escape");
  await page.getByTitle("Schließen").last().click().catch(() => undefined);
  await page.getByRole("button", { name: "Einstellungen" }).last().click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `${theme}-einstellungen.png`) });
  await page.close();
}

await browser.close();
console.log(`Screenshots in ${outDir}`);
