import { getToken as getTokenAstro } from "@ryantamulevicz/convex-better-auth-astro";
import { createAuth } from "../../convex/auth";
import { getStaticAuth } from "@convex-dev/better-auth";

export const getToken = () => {
  return getTokenAstro(getStaticAuth(createAuth));
};
