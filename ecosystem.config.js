module.exports = {
  apps: [
    {
      name: 'hoppokart',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'uploads', 'database', 'logs'],
      merge_logs: true,
      node_args: '--max-old-space-size=512'
    }
  ],
  deploy: {
    production: {
      user: 'root',
      host: 'your-hostinger-ip-or-domain',
      ref: 'origin/main',
      repo: 'your-github-repo-url',
      path: '/var/www/hoppokart',
      'post-deploy': 'npm install && pm2 restart all'
    }
  }
};
