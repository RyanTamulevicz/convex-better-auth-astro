import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { authClient } from "../../lib/react/auth-client";
import { withConvexProvider } from "../../lib/react/react-convex";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { actions } from "astro:actions";
import {
  extractResultError,
  friendlyAuthError,
  validateAuthForm,
  validateUsername,
  type AuthFormValues,
  type AuthMode,
} from "@/lib/auth/ui-helpers";

type FormStatus = "idle" | "pending" | "success" | "error";

const initialValues: Record<AuthMode, AuthFormValues> = {
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
  const [values, setValues] = useState<AuthFormValues>(() => ({
    ...initialValues[mode],
  }));
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setValues({ ...initialValues[mode] });
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

  const successMessage = useMemo(() => {
    return mode === "signIn"
      ? "Signed in successfully."
      : "Account created! Check your inbox to verify your email.";
  }, [mode]);

  const fallbackMessage = useMemo(() => {
    return mode === "signIn"
      ? "Unable to sign you in. Double-check your email and password and try again."
      : "Unable to create your account right now. Please try again.";
  }, [mode]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const validation = validateAuthForm(mode, values);
      if (!validation.ok) {
        setStatus("error");
        setErrorMessage(validation.error);
        return;
      }

      const sanitized = validation.values;

      setValues((current) => ({
        ...current,
        email: sanitized.email,
        ...(mode === "signUp" && sanitized.username
          ? { username: sanitized.username }
          : {}),
      }));

      setStatus("pending");
      setErrorMessage(null);

      try {
        if (mode === "signIn") {
          const response = await authClient.signIn.email({
            email: sanitized.email,
            password: sanitized.password,
          });
          const resultError = extractResultError(response);
          if (resultError) {
            throw new Error(friendlyAuthError(resultError, fallbackMessage));
          }
        } else {
          const response = await authClient.signUp.email({
            name: sanitized.username ?? sanitized.email,
            email: sanitized.email,
            password: sanitized.password,
          });
          const resultError = extractResultError(response);
          if (resultError) {
            throw new Error(friendlyAuthError(resultError, fallbackMessage));
          }
        }

        setStatus("success");
        setErrorMessage(null);
        setValues({ ...initialValues[mode] });
      } catch (error) {
        setStatus("error");
        setErrorMessage(friendlyAuthError(error, fallbackMessage));
      }
    },
    [fallbackMessage, mode, values]
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

  const idPrefix = `auth-${mode}`;
  const usernameId = `${idPrefix}-username`;
  const emailId = `${idPrefix}-email`;
  const passwordId = `${idPrefix}-password`;
  const statusMessageId = `${idPrefix}-status-message`;
  const isPending = status === "pending";
  const showError = status === "error" && !!errorMessage;
  const showSuccess = status === "success";

  return (
    <Card
      aria-busy={isPending}
      aria-live="polite"
      className="w-full max-w-md shadow-lg"
    >
      <CardHeader>
        <CardTitle>{headline}</CardTitle>
        <CardDescription>{helpText}</CardDescription>
      </CardHeader>
      <form className="space-y-6" onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4">
          <fieldset disabled={isPending} className="grid gap-4">
            {mode === "signUp" ? (
              <div className="grid gap-2">
                <label
                  className="text-sm font-medium leading-none"
                  htmlFor={usernameId}
                >
                  Username
                </label>
                <Input
                  id={usernameId}
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={values.username ?? ""}
                  onChange={handleChange}
                  placeholder="janedoe"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This is the name we'll show across the app.
                </p>
              </div>
            ) : null}
            <div className="grid gap-2">
              <label
                className="text-sm font-medium leading-none"
                htmlFor={emailId}
              >
                Email
              </label>
              <Input
                id={emailId}
                type="email"
                name="email"
                autoComplete="email"
                value={values.email}
                onChange={handleChange}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <label
                className="text-sm font-medium leading-none"
                htmlFor={passwordId}
              >
                Password
              </label>
              <Input
                id={passwordId}
                type="password"
                name="password"
                autoComplete={
                  mode === "signIn" ? "current-password" : "new-password"
                }
                value={values.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
              />
            </div>
          </fieldset>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-3">
          <Button
            type="submit"
            className="w-full"
            disabled={isPending}
            aria-describedby={
              showError || showSuccess ? statusMessageId : undefined
            }
          >
            {submitLabel}
          </Button>
          {showError && errorMessage ? (
            <p
              id={statusMessageId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
            >
              {errorMessage}
            </p>
          ) : null}
          {showSuccess ? (
            <p
              id={statusMessageId}
              role="status"
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600"
            >
              {successMessage}
            </p>
          ) : null}
        </CardFooter>
      </form>
    </Card>
  );
}

function SignedInPanel() {
  const { data: session } = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [optimisticName, setOptimisticName] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<FormStatus>("idle");
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

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
      ? (session as { user?: { name?: string | null; email?: string | null } })
          .user
      : undefined;
  const displayName =
    userDetails?.name ??
    userDetails?.email ??
    activeSession?.userId ??
    "friend";
  const effectiveName = optimisticName ?? displayName;
  const updateFallbackMessage =
    "We couldn't update your name. Please try again.";
  const isUpdatePending = updateStatus === "pending";

  useEffect(() => {
    setNameInput(displayName);
    setOptimisticName(null);
    setUpdateStatus("idle");
    setUpdateMessage(null);
  }, [displayName]);

  const handleNameInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setNameInput(event.currentTarget.value);
      setUpdateStatus("idle");
      setUpdateMessage(null);
    },
    []
  );

  const handleUpdateName = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const validation = validateUsername(nameInput);
      if (!validation.ok) {
        setUpdateStatus("error");
        setUpdateMessage(validation.error);
        return;
      }

      const sanitized = validation.value;
      if (sanitized === displayName) {
        setUpdateStatus("success");
        setUpdateMessage("That's already your current name.");
        setNameInput(sanitized);
        return;
      }

      setUpdateStatus("pending");
      setUpdateMessage(null);

      try {
        await actions.updateUsername({ name: sanitized });
        setUpdateStatus("success");
        setUpdateMessage("Name updated!");
        setNameInput(sanitized);
        setOptimisticName(sanitized);
      } catch (error) {
        setUpdateStatus("error");
        setUpdateMessage(friendlyAuthError(error, updateFallbackMessage));
      }
    },
    [displayName, nameInput, updateFallbackMessage]
  );

  return (
    <Card aria-live="polite" className="w-full max-w-2xl shadow-lg">
      <CardHeader>
        <CardTitle>Welcome back, {effectiveName}!</CardTitle>
        <CardDescription>
          You are signed in and your Convex client is authenticated.
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing Out..." : "Sign Out"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Signed in as{" "}
          <span className="font-medium text-foreground">{effectiveName}</span>.
        </p>
        {userDetails?.email ? (
          <p>
            Email:{" "}
            <span className="font-mono text-foreground">
              {userDetails.email}
            </span>
          </p>
        ) : null}
        {activeSession?.userId ? (
          <p className="break-all font-mono text-xs text-muted-foreground/90">
            User ID:{" "}
            <span className="text-foreground">{activeSession.userId}</span>
          </p>
        ) : null}
        <p>
          You can now call Convex queries and mutations with this authenticated
          client.
        </p>
        <div className="rounded-lg border border-border/60 bg-background/60 p-4 text-foreground shadow-sm">
          <form className="space-y-3" onSubmit={handleUpdateName}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label
                className="text-sm font-medium text-muted-foreground sm:w-32"
                htmlFor="profile-display-name"
              >
                Display name
              </label>
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="profile-display-name"
                  name="profile-display-name"
                  value={nameInput}
                  onChange={handleNameInputChange}
                  autoComplete="nickname"
                  placeholder="Your name"
                  disabled={isUpdatePending}
                  className="sm:flex-1"
                  aria-describedby={
                    updateMessage ? "profile-name-feedback" : undefined
                  }
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isUpdatePending}
                >
                  {isUpdatePending ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
            {updateMessage ? (
              <p
                id="profile-name-feedback"
                role={updateStatus === "error" ? "alert" : "status"}
                className={
                  updateStatus === "error"
                    ? "text-sm font-medium text-destructive"
                    : "text-sm font-medium text-emerald-600 dark:text-emerald-400"
                }
              >
                {updateMessage}
              </p>
            ) : null}
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

export default withConvexProvider(function Hello() {
  const containerClasses =
    "mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10";
  const [mode, setMode] = useState<AuthMode>("signIn");

  return (
    <>
      <AuthLoading>
        <div className={`${containerClasses} items-center`}>
          <Card className="w-full max-w-md shadow-lg">
            <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-2 w-2 animate-ping rounded-full bg-primary"
              />
              <p>Loading your session…</p>
            </CardContent>
          </Card>
        </div>
      </AuthLoading>
      <Authenticated>
        <div className={`${containerClasses} items-center`}>
          <SignedInPanel />
        </div>
      </Authenticated>
      <Unauthenticated>
        <div className={containerClasses}>
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-semibold tracking-tight">
              Get started with Convex + Better Auth + React + Astro
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to browse protected data or create an account to begin.
            </p>
          </div>
          <div className="mx-auto w-full max-w-md space-y-4">
            <div
              role="group"
              aria-label="Authentication mode"
              className="flex justify-center gap-2"
            >
              <Button
                type="button"
                variant={mode === "signIn" ? "default" : "outline"}
                onClick={() => setMode("signIn")}
                aria-pressed={mode === "signIn"}
              >
                Sign In
              </Button>
              <Button
                type="button"
                variant={mode === "signUp" ? "default" : "outline"}
                onClick={() => setMode("signUp")}
                aria-pressed={mode === "signUp"}
              >
                Sign Up
              </Button>
            </div>
            <AuthForm mode={mode} />
          </div>
        </div>
      </Unauthenticated>
    </>
  );
});
