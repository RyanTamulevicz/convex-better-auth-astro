import type { Auth } from "better-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ConvexClientMockCall = {
  url: string;
  setAuth: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  mutation: ReturnType<typeof vi.fn>;
  action: ReturnType<typeof vi.fn>;
};

const {
  sessionCookieName,
  createCookieGetterMock,
  betterFetchMock,
  convexInstances,
} = vi.hoisted(() => {
  const sessionCookieName = "__Secure-better-auth.session-token";

  const convexInstances: ConvexClientMockCall[] = [];

  const createCookieGetterMock = vi.fn(() => (key: string) => ({
    name: key === "sessionToken" ? sessionCookieName : key,
    value: key,
  }));
  const betterFetchMock = vi.fn(async () => ({ data: {} }));

  return {
    sessionCookieName,
    createCookieGetterMock,
    betterFetchMock,
    convexInstances,
  };
});

vi.mock("better-auth/cookies", () => ({
  createCookieGetter: createCookieGetterMock,
}));

vi.mock("@better-fetch/fetch", () => ({
  betterFetch: betterFetchMock,
}));

vi.mock("convex/browser", () => {
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

const createAuthInstance = (options: Record<string, unknown> = {}): Auth<any> =>
  ({ options } as unknown as Auth<any>);

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  convexInstances.length = 0;
  betterFetchMock.mockResolvedValue({ data: { user: { id: "user" } } });
  process.env.VITE_CONVEX_URL = "https://convex.example";
  process.env.VITE_CONVEX_SITE_URL = "https://site.example";
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

describe("getCookieName", () => {
  it("returns the configured JWT cookie name", () => {
    const auth = createAuthInstance();
    const name = getCookieName(auth);

    expect(name).toBe(sessionCookieName);
    expect(createCookieGetterMock).toHaveBeenCalledWith(auth.options);
  });
});

describe("getToken", () => {
  it("reads from a cookie header string", () => {
    const token = getToken(createAuthInstance(), `${sessionCookieName}=abc`);
    expect(token).toBe("abc");
  });

  it("reads from headers and astro cookies", () => {
    const headers = new Headers({
      cookie: `${sessionCookieName}=cookie-token`,
    });
    const tokenFromHeaders = getToken(createAuthInstance(), headers);

    const astroCookies = {
      get: vi.fn(() => ({ value: "astro-token" })),
    };
    const context: AstroRequestContext = {
      request: new Request("https://example.com"),
      cookies: astroCookies as any,
    };

    const tokenFromContext = getToken(createAuthInstance(), context);

    expect(tokenFromHeaders).toBe("cookie-token");
    expect(tokenFromContext).toBe("astro-token");
    expect(astroCookies.get).toHaveBeenCalledWith(sessionCookieName);
  });
});

describe("setupFetchClient", () => {
  it("constructs a Convex client with the session token", async () => {
    const client = await setupFetchClient(
      createAuthInstance(),
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
    delete process.env.VITE_CONVEX_URL;
    const client = await setupFetchClient(createAuthInstance());
    expect(() =>
      client.fetchQuery({ _args: undefined } as any, undefined)
    ).toThrow("VITE_CONVEX_URL is not set");
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
      createAuthInstance()
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
    delete process.env.VITE_CONVEX_SITE_URL;
    const request = new Request("https://astro.dev");
    const handler = astroHandler();
    await expect(handler({ request } as any)).rejects.toThrow(
      "VITE_CONVEX_SITE_URL is not set"
    );
  });
});
