import { betterFetch } from "@better-fetch/fetch";
import type { APIContext, AstroCookies } from "astro";
import type { betterAuth } from "better-auth";
import { createCookieGetter } from "better-auth/cookies";
import { ConvexHttpClient } from "convex/browser";
import type {
  FunctionReference,
  FunctionReturnType,
  GenericActionCtx,
  GenericDataModel,
} from "convex/server";
import { type CreateAuth, getStaticAuth } from "@convex-dev/better-auth";
import { JWT_COOKIE_NAME } from "@convex-dev/better-auth/plugins";

export type AstroRequestContext =
  | Pick<APIContext, "request" | "cookies">
  | { request: Request; cookies?: AstroCookies };

type CookieSource =
  | AstroRequestContext
  | AstroCookies
  | Request
  | Headers
  | string
  | undefined;

type ConvexFetchClient = {
  fetchQuery<
    Query extends FunctionReference<"query">,
    FuncRef extends FunctionReference<any, any>
  >(
    query: Query,
    args: FuncRef["_args"]
  ): Promise<FunctionReturnType<Query>>;
  fetchMutation<
    Mutation extends FunctionReference<"mutation">,
    FuncRef extends FunctionReference<any, any>
  >(
    mutation: Mutation,
    args: FuncRef["_args"]
  ): Promise<FunctionReturnType<Mutation>>;
  fetchAction<
    Action extends FunctionReference<"action">,
    FuncRef extends FunctionReference<any, any>
  >(
    action: Action,
    args: FuncRef["_args"]
  ): Promise<FunctionReturnType<Action>>;
};

type InferSession<
  T extends (ctx: GenericActionCtx<any>) => ReturnType<typeof betterAuth>
> = ReturnType<T>["$Infer"]["Session"];

type AstroHandler = (context: Pick<APIContext, "request">) => Promise<Response>;

const safeDecode = (value: string) => {
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
) => {
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
    return readCookie(source.request, name);
  }
  return undefined;
};

export const getCookieName = <DataModel extends GenericDataModel>(
  createAuth: CreateAuth<DataModel>
): string => {
  const createCookie = createCookieGetter(getStaticAuth(createAuth).options);
  const cookie = createCookie(JWT_COOKIE_NAME);
  return cookie.name;
};

export const getToken = <DataModel extends GenericDataModel>(
  createAuth: CreateAuth<DataModel>,
  source?: CookieSource
): string | undefined => {
  const sessionCookieName = getCookieName(createAuth);
  const token = readCookie(source, sessionCookieName);

  if (!token) {
    const isSecure = sessionCookieName.startsWith("__Secure-");
    const insecureCookieName = sessionCookieName.replace("__Secure-", "");
    const secureCookieName = isSecure
      ? sessionCookieName
      : `__Secure-${insecureCookieName}`;
    const secureToken = readCookie(source, secureCookieName);
    const insecureToken = readCookie(source, insecureCookieName);

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

export const setupFetchClient = async <DataModel extends GenericDataModel>(
  createAuth: CreateAuth<DataModel>,
  cookies?: CookieSource,
  opts?: { convexUrl?: string }
): Promise<ConvexFetchClient> => {
  const createClient = () => {
    const convexUrl = opts?.convexUrl ?? process.env.PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("PUBLIC_CONVEX_URL is not set");
    }
    const client = new ConvexHttpClient(convexUrl);
    const token = getToken(createAuth, cookies);
    if (token) {
      client.setAuth(token);
    }
    return client;
  };
  return {
    fetchQuery<
      Query extends FunctionReference<"query">,
      FuncRef extends FunctionReference<any, any>
    >(
      query: Query,
      args: FuncRef["_args"]
    ): Promise<FunctionReturnType<Query>> {
      return createClient().query(query, args);
    },
    fetchMutation<
      Mutation extends FunctionReference<"mutation">,
      FuncRef extends FunctionReference<any, any>
    >(
      mutation: Mutation,
      args: FuncRef["_args"]
    ): Promise<FunctionReturnType<Mutation>> {
      return createClient().mutation(mutation, args);
    },
    fetchAction<
      Action extends FunctionReference<"action">,
      FuncRef extends FunctionReference<any, any>
    >(
      action: Action,
      args: FuncRef["_args"]
    ): Promise<FunctionReturnType<Action>> {
      return createClient().action(action, args);
    },
  };
};

export const fetchSession = async <
  T extends (ctx: GenericActionCtx<any>) => ReturnType<typeof betterAuth>
>(
  request: Request,
  opts?: {
    convexSiteUrl?: string;
    verbose?: boolean;
  }
): Promise<{ session: InferSession<T> | null }> => {
  type Session = InferSession<T>;

  if (!request) {
    throw new Error("No request found");
  }
  const convexSiteUrl =
    opts?.convexSiteUrl ?? process.env.PUBLIC_CONVEX_SITE_URL;
  if (!convexSiteUrl) {
    throw new Error("PUBLIC_CONVEX_SITE_URL is not set");
  }
  const { data: session } = await betterFetch<Session | null>(
    "/api/auth/get-session",
    {
      baseURL: convexSiteUrl,
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    }
  );
  return {
    session: session ?? null,
  };
};

export const getAuth = async <DataModel extends GenericDataModel>(
  context: AstroRequestContext,
  createAuth: CreateAuth<DataModel>,
  opts?: { convexSiteUrl?: string }
): Promise<{ userId: string | undefined; token: string | undefined }> => {
  const { request } = context;
  if (!request) {
    throw new Error("No request found");
  }
  const token = getToken(createAuth, context);
  const { session } = await fetchSession(request, opts);
  return {
    userId: session?.user.id,
    token,
  };
};

const handler = (request: Request, opts?: { convexSiteUrl?: string }) => {
  const requestUrl = new URL(request.url);
  const convexSiteUrl =
    opts?.convexSiteUrl ?? process.env.PUBLIC_CONVEX_SITE_URL;
  if (!convexSiteUrl) {
    throw new Error("PUBLIC_CONVEX_SITE_URL is not set");
  }
  const nextUrl = `${convexSiteUrl}${requestUrl.pathname}${requestUrl.search}`;
  const forwardRequest = new Request(nextUrl, request);
  forwardRequest.headers.set("accept-encoding", "application/json");
  return fetch(forwardRequest, { method: request.method, redirect: "manual" });
};

export const astroHandler = (opts?: {
  convexSiteUrl?: string;
}): AstroHandler => {
  return async ({ request }) => handler(request, opts);
};

/**
 * Creates helper functions bound to your Better Auth `createAuth` instance.
 * The helpers accept any Astro server context (actions, middleware, API routes)
 * as the cookie source, so you can reuse a single setup everywhere.
 *
 * @example
 * import { createAstroAuthHelpers } from "@ryantamulevicz/convex-better-auth-astro";
 * import { createAuth } from "../convex/auth";
 *
 * const { setupFetchClient } = createAstroAuthHelpers(createAuth);
 * const convex = await setupFetchClient(context, {
 *   convexUrl: import.meta.env.PUBLIC_CONVEX_URL,
 * });
 * await convex.fetchMutation(api.users.updateUsername, { username });
 */
export const createAstroAuthHelpers = <DataModel extends GenericDataModel>(
  createAuth: CreateAuth<DataModel>
): {
  getToken: (source?: CookieSource) => string | undefined;
  getAuth: (
    context: AstroRequestContext,
    opts?: { convexSiteUrl?: string }
  ) => Promise<{ userId: string | undefined; token: string | undefined }>;
  setupFetchClient: (
    cookies?: CookieSource,
    opts?: { convexUrl?: string }
  ) => Promise<ConvexFetchClient>;
} => {
  return {
    getToken: (source?: CookieSource) => getToken(createAuth, source),
    getAuth: (
      context: AstroRequestContext,
      opts?: { convexSiteUrl?: string }
    ) => getAuth(context, createAuth, opts),
    setupFetchClient: (cookies?: CookieSource, opts?: { convexUrl?: string }) =>
      setupFetchClient(createAuth, cookies, opts),
  };
};
