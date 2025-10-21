import { createAstroAuthHelpers } from "@ryantamulevicz/convex-better-auth-astro";
import { createAuth } from "../../convex/auth";

const { getToken, getAuth, setupFetchClient } =
  createAstroAuthHelpers(createAuth);

export { getAuth, getToken, setupFetchClient };
