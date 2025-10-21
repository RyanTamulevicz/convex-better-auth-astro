import { defineMiddleware } from "astro:middleware";
import { fetchSession } from "@ryantamulevicz/convex-better-auth-astro";
import { getToken } from "$lib/auth-server";

const convexSiteUrl = import.meta.env.PUBLIC_CONVEX_SITE_URL;

export const onRequest = defineMiddleware(async (context, next) => {
  try {
    const token = getToken(context);
    const { session } = await fetchSession(
      context.request,
      convexSiteUrl ? { convexSiteUrl } : undefined
    );
    context.locals.user = session?.user ?? null;
    context.locals.session = session?.session ?? null;
    context.locals.convexToken = token ?? null;
  } catch {
    context.locals.user = null;
    context.locals.session = null;
    context.locals.convexToken = null;
  }

  return next();
});
