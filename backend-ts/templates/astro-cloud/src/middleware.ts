import { defineMiddleware } from "astro:middleware";
import { auth } from "./lib/auth";

const publicPaths = ["/", "/login", "/register", "/api/auth"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Allow public routes, static assets, and API auth
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_astro") ||
    pathname.includes(".")
  ) {
    return next();
  }

  // Check session via Better Auth
  const headers = new Headers();
  const cookieHeader = context.request.headers.get("cookie");
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const session = await auth.api.getSession({
    headers,
  });

  if (!session) {
    return context.redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  }

  // Store session on locals for downstream use
  context.locals.session = session;

  return next();
});
