const { betterAuth } = require('better-auth');
const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins: [
    'http://localhost:3000',
    process.env.APP_URL || '',
  ].filter(Boolean),
  baseURL: 'http://localhost:3000',
});

module.exports = { auth };
