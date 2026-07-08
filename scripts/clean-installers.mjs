import { readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const releaseDir = resolve(import.meta.dirname, "..", "release");

try {
  for (const name of readdirSync(releaseDir)) {
    if (
      /^LunaMail(?: |-)Setup(?: |-).+\.(?:exe|exe\.blockmap)$/i.test(name)
      || name === "latest.yml"
      || name === "win-unpacked"
      || name === "win-unpacked.tmp"
    ) {
      rmSync(resolve(releaseDir, name), { recursive: true, force: true });
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
