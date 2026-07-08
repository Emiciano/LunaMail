import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");

rmSync(resolve(root, "dist"), { recursive: true, force: true });

for (const args of [
  [resolve(root, "node_modules", "typescript", "bin", "tsc")],
  [resolve(root, "node_modules", "vite", "bin", "vite.js"), "build"]
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    shell: false,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
