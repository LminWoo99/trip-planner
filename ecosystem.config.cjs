// pm2 process for the home server VM. Secrets live in .env (not in git):
//   TRIP_GATE_CODE=MMDD
//   PB_HTTP=0.0.0.0:8090   (optional; the Cloudflare Tunnel on the Mac reaches <vm>.orb.local:8090)
const fs = require("node:fs");
const path = require("node:path");

const env = {};
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

module.exports = {
  apps: [
    {
      name: "trip-planner",
      cwd: __dirname,
      script: "./pocketbase",
      args: `serve --http=${env.PB_HTTP || "0.0.0.0:8090"} --dir=./pb_data --hooksDir=./pb_hooks --migrationsDir=./pb_migrations --publicDir=./pb_public`,
      interpreter: "none",
      env: { TRIP_GATE_CODE: env.TRIP_GATE_CODE || "" },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 2000,
    },
  ],
};
