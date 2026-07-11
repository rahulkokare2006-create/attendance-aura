module.exports = {
  apps: [
    {
      name: 'attendance-aura-backend',
      script: 'index.js',
      cwd: './attendance-backend-mongo',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3001,
        MONGODB_URI: process.env.MONGODB_URI,
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
        FRONTEND_URL: process.env.FRONTEND_URL,
        GMAIL_USER: process.env.GMAIL_USER,
        GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD,
      },
    },
  ],
};
