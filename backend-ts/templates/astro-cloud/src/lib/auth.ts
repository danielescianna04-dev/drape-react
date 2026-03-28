import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({
  connectionString: import.meta.env.DATABASE_URL || process.env.DATABASE_URL,
});

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:4321",
    process.env.APP_URL || "",
  ].filter(Boolean),
  baseURL: "http://localhost:4321",
});
