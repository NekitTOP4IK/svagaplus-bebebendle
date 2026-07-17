const path = require("node:path");

const root = __dirname;

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
    },
  ],
};
