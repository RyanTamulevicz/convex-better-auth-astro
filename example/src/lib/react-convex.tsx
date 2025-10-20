import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import type { FunctionComponent, JSX } from "react";
import { authClient } from "./auth-client";

// Initialized once so all components share the same client.
const convex = new ConvexReactClient(
  import.meta.env.PUBLIC_CONVEX_URL as string,
  {
    // Optionally pause queries until the user is authenticated
    expectAuth: true,
  }
);

export function withConvexProvider<Props extends JSX.IntrinsicAttributes>(
  Component: FunctionComponent<Props>
) {
  return function WithConvexProvider(props: Props) {
    return (
      <ConvexBetterAuthProvider client={convex} authClient={authClient}>
        <Component {...props} />
      </ConvexBetterAuthProvider>
    );
  };
}
