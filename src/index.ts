import { betterFetch } from "@better-fetch/fetch";
import type { APIContext, AstroCookies } from "astro";
import type { Auth, betterAuth } from "better-auth";
import { createCookieGetter } from "better-auth/cookies";
import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionReference,
  FunctionReturnType,
  GenericActionCtx,
  GenericDataModel,
} from "convex/server";

/** Minimal subset of Astro's API context the helpers care about. */
export type AstroRequestContext =
  | Pick<APIContext, "request" | "cookies">
  | { request: Request; cookies?: AstroCookies };

export type CookieSource =
  | AstroRequestContext
  | AstroCookies
  | Request
  | Headers
  | string
  | undefined;

const SESSION_COOKIE_KEY = "sessionToken";
type BetterAuthInstance = Auth<any>;

const getEnvVar = (key: string): string | undefined =>
  typeof process !== "undefined" ? process.env?.[key] : undefined;

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isAstroCookies = (value: unknown): value is AstroCookies =>
  !!value &&
  typeof value === "object" &&
  "get" in value &&
  typeof (value as { get?: unknown }).get === "function";

const readCookieFromHeader = (
  cookieHeader: string | null | undefined,
  name: string
): string | undefined => {
  if (!cookieHeader) {
    return undefined;
  }

  for (const pair of cookieHeader.split(/;\s*/)) {
    if (!pair) {
      continue;
    }

    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = safeDecode(pair.slice(0, separatorIndex).trim());
    if (key !== name) {
      continue;
    }

    const rawValue = pair.slice(separatorIndex + 1);
    return safeDecode(rawValue);
  }

  return undefined;
};

const readCookie = (source: CookieSource, name: string): string | undefined => {
  if (!source) {
    return undefined;
  }

  if (typeof source === "string") {
    return readCookieFromHeader(source, name);
  }

  if (source instanceof Headers) {
    return readCookieFromHeader(source.get("cookie"), name);
  }

  if (source instanceof Request) {
    return readCookie(source.headers, name);
  }

  if (isAstroCookies(source)) {
    const cookie = source.get(name);
    return typeof cookie?.value === "string" ? cookie.value : undefined;
  }

  if (
    typeof source === "object" &&
    source !== null &&
    "cookies" in source &&
    source.cookies
  ) {
    const fromStore = readCookie(source.cookies, name);
    if (fromStore) {
      return fromStore;
    }
  }

  if (
    typeof source === "object" &&
    source !== null &&
    "request" in source &&
    source.request
  ) {
    return readCookie(source.request as Request, name);
  }

  return undefined;
};

/** Derive the Convex JWT cookie name configured for better-auth. */
export const getCookieName = (auth: BetterAuthInstance): string => {
  const createCookie = createCookieGetter(auth.options);
  const cookie = createCookie(SESSION_COOKIE_KEY);
  return cookie.name;
};

/** Read the Convex session token from the provided cookie sources. */
export const getToken = (
  auth: BetterAuthInstance,
  cookies?: CookieSource
): string | undefined => {
  const sessionCookieName = getCookieName(auth);
  const token = readCookie(cookies, sessionCookieName);

  if (!token) {
    const isSecure = sessionCookieName.startsWith("__Secure-");
    const insecureCookieName = sessionCookieName.replace("__Secure-", "");
    const secureCookieName = isSecure
      ? sessionCookieName
      : `__Secure-${insecureCookieName}`;
    const secureToken = readCookie(cookies, secureCookieName);
    const insecureToken = readCookie(cookies, insecureCookieName);

    if (isSecure && insecureToken) {
      console.warn(
        `Looking for secure cookie ${sessionCookieName} but found insecure cookie ${insecureCookieName}`
      );
    }

    if (!isSecure && secureToken) {
      console.warn(
        `Looking for insecure cookie ${sessionCookieName} but found secure cookie ${secureCookieName}`
      );
    }
  }

  return token;
};

type ConvexFetchClient<DataModel extends GenericDataModel> = {
  fetchQuery<Query extends FunctionReference<"query">>(
    query: Query,
    args: Query["_args"]
  ): Promise<FunctionReturnType<Query>>;
  fetchMutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    args: Mutation["_args"]
  ): Promise<FunctionReturnType<Mutation>>;
  fetchAction<Action extends FunctionReference<"action">>(
    action: Action,
    args: Action["_args"]
  ): Promise<FunctionReturnType<Action>>;
};

/**
 * Build a tiny Convex HTTP client wrapper that automatically forwards the
 * session token extracted from cookies.
 */
export const setupFetchClient = async <DataModel extends GenericDataModel>(
  auth: BetterAuthInstance,
  cookies?: CookieSource,
  opts?: { convexUrl?: string }
): Promise<ConvexFetchClient<DataModel>> => {
  const createClient = () => {
    const convexUrl = opts?.convexUrl ?? getEnvVar("VITE_CONVEX_URL");
    if (!convexUrl) {
      throw new Error("VITE_CONVEX_URL is not set");
    }

    const client = new ConvexHttpClient(convexUrl);
    const token = getToken(auth, cookies);
    if (token) {
      client.setAuth(token);
    }

    return client;
  };

  return {
    fetchQuery<Query extends FunctionReference<"query">>(
      query: Query,
      args: Query["_args"]
    ): Promise<FunctionReturnType<Query>> {
      return createClient().query(query, args);
    },
    fetchMutation<Mutation extends FunctionReference<"mutation">>(
      mutation: Mutation,
      args: Mutation["_args"]
    ): Promise<FunctionReturnType<Mutation>> {
      return createClient().mutation(mutation, args);
    },
    fetchAction<Action extends FunctionReference<"action">>(
      action: Action,
      args: Action["_args"]
    ): Promise<FunctionReturnType<Action>> {
      return createClient().action(action, args);
    },
  };
};

/**
 * Fetch the current better-auth session by forwarding request cookies to Convex.
 */
export const fetchSession = async <
  T extends (ctx: GenericActionCtx<any>) => ReturnType<typeof betterAuth>
>(
  request: Request,
  opts?: {
    convexSiteUrl?: string;
    verbose?: boolean;
  }
): Promise<{ session: ReturnType<T>["$Infer"]["Session"] | undefined }> => {
  type Session = ReturnType<T>["$Infer"]["Session"];

  if (!request) {
    throw new Error("No request found");
  }

  const convexSiteUrl =
    opts?.convexSiteUrl ?? getEnvVar("VITE_CONVEX_SITE_URL");
  if (!convexSiteUrl) {
    throw new Error("VITE_CONVEX_SITE_URL is not set");
  }

  const { data: session } = await betterFetch<Session>(
    "/api/auth/get-session",
    {
      baseURL: convexSiteUrl,
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    }
  );

  return {
    session: session ?? undefined,
  };
};

/**
 * Convenience helper for Astro endpoints that need both the Convex token and session.
 */
export const getAuth = async <DataModel extends GenericDataModel>(
  context: AstroRequestContext,
  auth: BetterAuthInstance,
  opts?: { convexSiteUrl?: string }
): Promise<{ userId: string | undefined; token: string | undefined }> => {
  const { request } = context;
  if (!request) {
    throw new Error("No request found");
  }

  const token = getToken(auth, context);
  const { session } = await fetchSession(request, opts);
  return {
    userId: session?.user?.id,
    token,
  };
};

const handler = (
  request: Request,
  opts?: { convexSiteUrl?: string }
): Promise<Response> => {
  const requestUrl = new URL(request.url);
  const convexSiteUrl =
    opts?.convexSiteUrl ?? getEnvVar("VITE_CONVEX_SITE_URL");
  if (!convexSiteUrl) {
    throw new Error("VITE_CONVEX_SITE_URL is not set");
  }

  const nextUrl = `${convexSiteUrl}${requestUrl.pathname}${requestUrl.search}`;
  const forwardRequest = new Request(nextUrl, request);
  forwardRequest.headers.set("accept-encoding", "application/json");
  return fetch(forwardRequest, { method: request.method, redirect: "manual" });
};

/**
 * Proxy an Astro route to the Convex site, keeping request details intact.
 */
export const astroHandler = (opts?: {
  convexSiteUrl?: string;
}): ((context: Pick<APIContext, "request">) => Promise<Response>) => {
  return async ({ request }: Pick<APIContext, "request">): Promise<Response> =>
    handler(request, opts);
};

export type {
  GenericActionCtx,
  GenericDataModel,
  FunctionReference,
  FunctionReturnType,
};
