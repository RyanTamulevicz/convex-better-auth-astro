import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { authClient } from "../../lib/react/auth-client";
import { withConvexProvider } from "../../lib/react/react-convex";

type AuthMode = "signIn" | "signUp";
type FormStatus = "idle" | "pending" | "success" | "error";

type FormValues = {
  email: string;
  password: string;
  username?: string;
};

const initialValues: Record<AuthMode, FormValues> = {
  signIn: {
    email: "",
    password: "",
  },
  signUp: {
    email: "",
    password: "",
    username: "",
  },
};

function AuthForm({ mode }: { mode: AuthMode }) {
  const [values, setValues] = useState<FormValues>(initialValues[mode]);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setValues(initialValues[mode]);
    setStatus("idle");
    setErrorMessage(null);
  }, [mode]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.currentTarget;
    setValues((current) => ({
      ...current,
      [name]: value,
    }));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setStatus("pending");
      setErrorMessage(null);

      try {
        if (mode === "signIn") {
          await authClient.signIn.email({
            email: values.email,
            password: values.password,
          });
        } else {
          const username = values.username?.trim();
          if (!username) {
            throw new Error("Please provide a username.");
          }

          await authClient.signUp.email({
            name: username,
            email: values.email,
            password: values.password,
          });
        }

        setStatus("success");
      } catch (error) {
        setStatus("error");
        const message =
          error instanceof Error ? error.message : "An unexpected error occurred.";
        setErrorMessage(message);
      }
    },
    [mode, values.email, values.password, values.username]
  );

  const { headline, submitLabel, helpText } = useMemo(() => {
    if (mode === "signIn") {
      return {
        headline: "Sign In",
        submitLabel: status === "pending" ? "Signing In..." : "Sign In",
        helpText: "Use your account credentials to access the dashboard.",
      } as const;
    }

    return {
      headline: "Create an Account",
      submitLabel: status === "pending" ? "Creating Account..." : "Sign Up",
      helpText: "Pick a username so we know what to call you.",
    } as const;
  }, [mode, status]);

  return (
    <section aria-live="polite">
      <h2>{headline}</h2>
      <p>{helpText}</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <fieldset disabled={status === "pending"}>
          {mode === "signUp" ? (
            <label>
              <span>Username</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={values.username ?? ""}
                onChange={handleChange}
                placeholder="janedoe"
                required
              />
            </label>
          ) : null}
          <label>
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={values.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              value={values.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
            />
          </label>
        </fieldset>
        <button type="submit" disabled={status === "pending"}>
          {submitLabel}
        </button>
      </form>
      {status === "error" && errorMessage ? (
        <p className="auth-feedback" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {status === "success" ? (
        <p className="auth-feedback success">Success! Check your inbox if you enrolled via email link.</p>
      ) : null}
    </section>
  );
}

function SignedInPanel() {
  const { data: session } = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
    } finally {
      setIsSigningOut(false);
    }
  }, []);

  const activeSession = session?.session;
  const userDetails =
    session && "user" in session
      ? (session as { user?: { name?: string | null; email?: string | null } }).user
      : undefined;
  const displayName =
    userDetails?.name ?? userDetails?.email ?? activeSession?.userId ?? "friend";

  return (
    <section>
      <h2>Welcome back, {displayName}!</h2>
      <p>You are signed in and your Convex client is authenticated.</p>
      <button type="button" onClick={handleSignOut} disabled={isSigningOut}>
        {isSigningOut ? "Signing Out..." : "Sign Out"}
      </button>
    </section>
  );
}

export default withConvexProvider(function Hello() {
  return (
    <>
      <AuthLoading>
        <p>Loading your session…</p>
      </AuthLoading>
      <Authenticated>
        <SignedInPanel />
      </Authenticated>
      <Unauthenticated>
        <div className="auth-panels">
          <AuthForm mode="signIn" />
          <AuthForm mode="signUp" />
        </div>
      </Unauthenticated>
    </>
  );
});
