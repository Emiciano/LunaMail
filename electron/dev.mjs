import { spawn } from "node:child_process";

const shell = process.platform === "win32";
const vite = spawn("vite", [], { shell, stdio: "inherit" });

async function waitForVite() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://localhost:1420");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite wurde nicht rechtzeitig gestartet.");
}

try {
  await waitForVite();
  const electron = spawn("electron", ["."], {
    shell,
    stdio: "inherit",
    env: { ...process.env, VITE_DEV_SERVER_URL: "http://localhost:1420" }
  });
  electron.on("exit", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
} catch (error) {
  vite.kill();
  console.error(error);
  process.exit(1);
}
