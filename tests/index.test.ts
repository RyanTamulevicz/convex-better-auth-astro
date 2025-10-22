import { beforeEach, describe, expect, it, vi } from "vitest";
import { JWT_COOKIE_NAME } from "@convex-dev/better-auth/plugins";
import type { Auth } from "better-auth";

type ConvexClientMockCall = {
  url: string;
  setAuth: any;
  query: any;
  mutation: any;
  action: any;
};

const sessionCookieName = JWT_COOKIE_NAME;
var createCookieGetterMock: ReturnType<typeof vi.fn>;
var betterFetchMock: ReturnType<typeof vi.fn>;
var convexInstances: ConvexClientMockCall[] = [];

vi.mock("better-auth/cookies", () => {
  createCookieGetterMock = vi
    .fn(() => (key: string) => ({
      name: key === JWT_COOKIE_NAME ? sessionCookieName : key,
      value: key,
    }))
    .mockName("createCookieGetter") as unknown as ReturnType<typeof vi.fn>;
  return {
    createCookieGetter: createCookieGetterMock,
  };
});

vi.mock("@better-fetch/fetch", () => {
  betterFetchMock = vi
    .fn(async () => ({ data: {} }))
    .mockName("betterFetch") as unknown as ReturnType<typeof vi.fn>;
  return {
    betterFetch: betterFetchMock,
  };
});

vi.mock("convex/browser", () => {
  convexInstances = [];
  class ConvexHttpClientMock {
    url: string;
    setAuth = vi.fn();
    query = vi.fn(async () => "query-result");
    mutation = vi.fn(async () => "mutation-result");
    action = vi.fn(async () => "action-result");

    constructor(url: string) {
      this.url = url;
      convexInstances.push(this as any);
    }
  }

  return {
    ConvexHttpClient: ConvexHttpClientMock,
  };
});

import {
  astroHandler,
  fetchSession,
  getAuth,
  getCookieName,
  getToken,
  setupFetchClient,
  type AstroRequestContext,
} from "../src/index.js";

const createAuthInstance = (
  options: Record<string, unknown> = {}
): {
  createAuth: (ctx?: unknown, args?: { optionsOnly?: boolean }) => Auth<any>;
  auth: Auth<any>;
} => {
  const auth = { options } as unknown as Auth<any>;
  const createAuth = vi
    .fn((ctx?: unknown, _args?: { optionsOnly?: boolean }) => auth)
    .mockName("createAuth");
  return { createAuth: createAuth as any, auth };
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  convexInstances.length = 0;
  betterFetchMock.mockResolvedValue({ data: { user: { id: "user" } } });
  process.env.PUBLIC_CONVEX_URL = "https://convex.example";
  process.env.PUBLIC_CONVEX_SITE_URL = "https://site.example";
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

describe("getCookieName", () => {
  it("returns the configured JWT cookie name", () => {
    const { createAuth, auth } = createAuthInstance();
    const name = getCookieName(createAuth);

    expect(name).toBe(sessionCookieName);
    expect(createCookieGetterMock).toHaveBeenCalledWith(auth.options);
    expect(createAuth).toHaveBeenCalledWith({}, { optionsOnly: true });
  });
});

describe("getToken", () => {
  it("reads from a cookie header string", () => {
    const { createAuth } = createAuthInstance();
    const token = getToken(createAuth, `${sessionCookieName}=abc`);
    expect(token).toBe("abc");
  });

  it("reads from headers and astro cookies", () => {
    const headers = new Headers({
      cookie: `${sessionCookieName}=cookie-token`,
    });
    const { createAuth } = createAuthInstance();
    const tokenFromHeaders = getToken(createAuth, headers);

    const astroCookies = {
      get: vi.fn(() => ({ value: "astro-token" })),
    };
    const context: AstroRequestContext = {
      request: new Request("https://example.com"),
      cookies: astroCookies as any,
    };

    const tokenFromContext = getToken(createAuth, context);

    expect(tokenFromHeaders).toBe("cookie-token");
    expect(tokenFromContext).toBe("astro-token");
    expect(astroCookies.get).toHaveBeenCalledWith(sessionCookieName);
  });
});

describe("setupFetchClient", () => {
  it("constructs a Convex client with the session token", async () => {
    const { createAuth } = createAuthInstance();
    const client = await setupFetchClient(
      createAuth,
      `${sessionCookieName}=session-token`
    );
    const queryRef = { _args: { foo: "bar" } } as any;
    const result = await client.fetchQuery(queryRef, queryRef._args);

    expect(convexInstances).toHaveLength(1);
    const instance = convexInstances[0];
    expect(instance.url).toBe("https://convex.example");
    expect(instance.setAuth).toHaveBeenCalledWith("session-token");
    expect(instance.query).toHaveBeenCalledWith(queryRef, queryRef._args);
    expect(result).toBe("query-result");
  });

  it("throws when the Convex URL is missing", async () => {
    delete process.env.PUBLIC_CONVEX_URL;
    const { createAuth } = createAuthInstance();
    const client = await setupFetchClient(createAuth);
    expect(() =>
      client.fetchQuery({ _args: undefined } as any, undefined)
    ).toThrow("PUBLIC_CONVEX_URL is not set");
    expect(convexInstances).toHaveLength(0);
  });
});

describe("fetchSession", () => {
  it("forwards cookies and returns the session", async () => {
    const request = new Request("https://astro.dev", {
      headers: { cookie: `${sessionCookieName}=my-token` },
    });

    const result = await fetchSession<any>(request);

    expect(betterFetchMock).toHaveBeenCalledWith("/api/auth/get-session", {
      baseURL: "https://site.example",
      headers: { cookie: `${sessionCookieName}=my-token` },
    });
    expect(result.session).toEqual({ user: { id: "user" } });
  });

  it("respects an explicit Convex site URL override", async () => {
    const request = new Request("https://astro.dev", {
      headers: { cookie: "session=my-token" },
    });

    await fetchSession<any>(request, { convexSiteUrl: "https://alt.site" });

    expect(betterFetchMock).toHaveBeenCalledWith("/api/auth/get-session", {
      baseURL: "https://alt.site",
      headers: { cookie: "session=my-token" },
    });
  });
});

describe("getAuth", () => {
  it("returns both user id and token", async () => {
    const request = new Request("https://astro.dev", {
      headers: { cookie: `${sessionCookieName}=user-token` },
    });

    const cookies = {
      get: vi.fn(() => ({ value: "astro-token" })),
    };

    const result = await getAuth(
      { request, cookies: cookies as any },
      createAuthInstance().createAuth
    );

    expect(result).toEqual({ userId: "user", token: "astro-token" });
  });
});

describe("astroHandler", () => {
  it("proxies the request to the Convex site", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy as any;

    const request = new Request("https://astro.dev/path?x=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });

    const handler = astroHandler();
    await handler({ request } as any);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [forwardRequest, init] = fetchSpy.mock.calls[0] as unknown as [
      Request,
      RequestInit
    ];
    expect((forwardRequest as Request).url).toBe(
      "https://site.example/path?x=1"
    );
    expect((forwardRequest as Request).headers.get("accept-encoding")).toBe(
      "application/json"
    );
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
  });

  it("throws if the Convex site URL is not set", async () => {
    delete process.env.PUBLIC_CONVEX_SITE_URL;
    const request = new Request("https://astro.dev");
    const handler = astroHandler();
    await expect(handler({ request } as any)).rejects.toThrow(
      "PUBLIC_CONVEX_SITE_URL is not set"
    );
  });
});
