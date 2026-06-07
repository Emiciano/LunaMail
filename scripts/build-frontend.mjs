import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");

rmSync(resolve(root, "dist"), { recursive: true, force: true });

for (const [cmd, args] of [
  ["tsc", []],
  ["vite", ["build"]]
]) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
