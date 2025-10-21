import { getToken as getTokenAstro } from "@ryantamulevicz/convex-better-auth-astro";
import { createAuth } from "../../convex/auth";
import type { APIContext } from "astro";

export const getToken = (context: APIContext) => {
  return getTokenAstro(createAuth, context);
};
