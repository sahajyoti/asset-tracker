const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const publicSourceDir = path.join(projectRoot, "public");
const publicTargetDir = path.join(distDir, "public");

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(publicTargetDir, { recursive: true, force: true });
fs.cpSync(publicSourceDir, publicTargetDir, { recursive: true });

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["pkg", "desktop-launcher.js", "--targets", "node18-win-x64", "--output", "dist/start-asset-tracker.exe"],
  {
    stdio: "inherit",
    cwd: projectRoot,
  }
);