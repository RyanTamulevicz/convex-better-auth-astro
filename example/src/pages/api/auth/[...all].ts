import { astroHandler } from "@ryantamulevicz/convex-better-auth-astro";
import type { APIRoute } from "astro";

const convexSiteUrl = import.meta.env.PUBLIC_CONVEX_SITE_URL;
const handler = astroHandler(convexSiteUrl ? { convexSiteUrl } : undefined);

export const prerender = false;

export const ALL: APIRoute = async (context) => {
  return handler(context);
};
