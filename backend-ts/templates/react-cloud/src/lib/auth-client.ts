import { createAuthClient } from "better-auth/react";

const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "";

export const authClient = createAuthClient({
  baseURL: API_BASE,
  fetchOptions: {
    credentials: "include" as RequestCredentials,
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
