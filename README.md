# @ryantamulevicz/convex-better-auth-astro

Utilities for wiring [better-auth](https://github.com/better-auth/better-auth) into an [Astro](https://astro.build/) project that talks to [Convex](https://convex.dev/).

## Setup

Spin up a new Astro project and add the required dependencies:

```bash
pnpm create astro@latest
cd your-project-name
pnpm add convex@latest @convex-dev/better-auth
pnpm add better-auth@1.3.27 --save-exact
pnpm add @ryantamulevicz/convex-better-auth-astro
```

This package expects the following peer dependencies to be installed in your project:

- `astro`
- `convex`
- `better-auth`
- `@better-fetch/fetch`

## Environment

Set the Convex URLs in your runtime environment:

- `VITE_CONVEX_URL` – Convex deployment URL used for the HTTP client.
- `VITE_CONVEX_SITE_URL` – Base URL where Convex is exposed publicly for session fetching.

You can override both values by passing `opts` to the helpers if you prefer not to rely on environment variables.

## Usage

```ts
import { betterAuth } from "better-auth";
import {
  astroHandler,
  getAuth,
  setupFetchClient,
} from "@ryantamulevicz/convex-better-auth-astro";

// however you create your Better Auth instance
const auth = betterAuth({ /* your options */ });

export const { fetchQuery, fetchMutation, fetchAction } =
  await setupFetchClient(auth);

export const get = astroHandler();

export async function getSession(context: APIContext) {
  return getAuth(context, auth);
}
```

Refer to the source for additional helpers like `getToken` and `fetchSession` that you can combine however you need.

## Development

- `npm run lint`
- `npm run test`
- `npm run build`

Publishing runs the tests automatically via `npm publish`.
