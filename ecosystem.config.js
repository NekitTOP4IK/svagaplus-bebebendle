module.exports = {
  apps: [
    {
      // Next.js frontend
      name: 'bebebendle-next',
      cwd: './next',
      script: 'bun',
      args: 'run start',
      instances: 1,
      autorestart: true,
      watch: false,
      env_file: '../.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      // Python Telegram bot
      name: 'bebebendle-bot',
      cwd: './bot',
      script: 'uv',
      args: 'run python src/main.py',
      interpreter: 'none', // important when using uv
      instances: 1,
      autorestart: true,
      watch: false,
      env_file: '../.env',
    },
  ],
};
