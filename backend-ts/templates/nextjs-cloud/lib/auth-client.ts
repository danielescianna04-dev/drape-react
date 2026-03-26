"use client";
import { createAuthClient } from "better-auth/react";

// Detect Drape preview prefix from the current page URL
function getDrapePreviewPrefix(): string {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/^\/preview\/[^/]+/);
  return match ? match[0] : "";
}

export const authClient = createAuthClient({
  fetchOptions: {
    customFetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
      let finalUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      // If running in Drape preview, prepend the preview prefix to relative paths
      const prefix = getDrapePreviewPrefix();
      if (prefix && typeof window !== "undefined") {
        try {
          const parsed = new URL(finalUrl);
          if (parsed.origin === window.location.origin && !parsed.pathname.startsWith(prefix)) {
            parsed.pathname = prefix + parsed.pathname;
            finalUrl = parsed.toString();
          }
        } catch {}
      }

      return fetch(finalUrl, init);
    },
  },
});

export const { signIn, signUp, signOut, useSession } = authClient;
