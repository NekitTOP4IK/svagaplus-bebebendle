const path = require("node:path");

const root = __dirname;
const deployRoot = process.env.BEBEBENDLE_DEPLOY_ROOT || root;
const sharedLogs = path.join(deployRoot, "shared", "logs");

module.exports = {
  apps: [
    {
      name: "bebebendle-next",
      cwd: root,
      script: path.join(root, "scripts/run-next.sh"),
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: "10s",
      time: true,
      out_file: path.join(sharedLogs, "next", "out.log"),
      error_file: path.join(sharedLogs, "next", "error.log"),
    },
    {
      name: "bebebendle-bot",
      cwd: root,
      script: path.join(root, "scripts/run-bot.sh"),
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: "10s",
      time: true,
      out_file: path.join(sharedLogs, "bot", "out.log"),
      error_file: path.join(sharedLogs, "bot", "error.log"),
    },
  ],
};
