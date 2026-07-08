// PM2 Ecosystem — Browze Bot License Server
// Usado para rodar em VPS (Hetzner, DigitalOcean, etc.)
// Comando: pm2 start ecosystem.config.js --env production

module.exports = {
  apps: [
    {
      name: 'browzebot-licenses',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 4444,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4444,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
    },
  ],
};
