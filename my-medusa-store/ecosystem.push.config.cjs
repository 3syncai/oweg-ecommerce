const path = require('node:path');
module.exports = { apps: [{
  name: 'oweg-notification-worker', cwd: __dirname,
  script: path.join(__dirname, 'scripts/web-push-worker.cjs'),
  interpreter: process.execPath, instances: 1, exec_mode: 'fork',
  autorestart: true, restart_delay: 5000, kill_timeout: 30000,
  max_memory_restart: '256M', env: { NODE_ENV: 'production' },
}] };
