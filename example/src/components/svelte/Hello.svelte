<script lang="ts">
  import { authClient } from "@/lib/svelte/auth-client";
  import { Button } from "@/components/ui/button/index";
  import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card/index";
  import { Input } from "@/components/ui/input/index";

  type AuthMode = "signIn" | "signUp";
  type FormStatus = "idle" | "pending" | "success" | "error";

  type FormValues = {
    email: string;
    password: string;
    username: string;
  };

  type SessionRecord = {
    session?: { userId?: string | null } | null;
    user?: { name?: string | null; email?: string | null } | null;
  };

  const initialValues: Record<AuthMode, FormValues> = {
    signIn: {
      email: "",
      password: "",
      username: "",
    },
    signUp: {
      email: "",
      password: "",
      username: "",
    },
  };

  const containerClasses =
    "mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10";

  let mode = $state<AuthMode>("signIn");
  let status = $state<FormStatus>("idle");
  let errorMessage = $state<string | null>(null);
  let values = $state<FormValues>({ ...initialValues.signIn });
  let isSigningOut = $state(false);

  const session = authClient.useSession();

  const copy = $derived.by(() => {
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
  });

  $effect(() => {
    mode;
    values = { ...initialValues[mode] };
    status = "idle";
    errorMessage = null;
  });

  const idPrefix = $derived(`auth-${mode}`);
  const usernameId = $derived(`${idPrefix}-username`);
  const emailId = $derived(`${idPrefix}-email`);
  const passwordId = $derived(`${idPrefix}-password`);
  const statusMessageId = $derived(`${idPrefix}-status-message`);
  const isPending = $derived(status === "pending");
  const showError = $derived(status === "error" && !!errorMessage);
  const showSuccess = $derived(status === "success");

  const sessionData = $derived.by(() => {
    const snapshot = $session;
    return snapshot &&
      typeof snapshot === "object" &&
      "data" in snapshot &&
      snapshot.data &&
      typeof snapshot.data === "object"
      ? (snapshot.data as SessionRecord)
      : null;
  });
  const activeSession = $derived(sessionData?.session ?? undefined);
  const userDetails = $derived(
    sessionData?.user && sessionData.user !== null
      ? sessionData.user
      : undefined
  );
  const displayName = $derived(
    userDetails?.name ?? userDetails?.email ?? activeSession?.userId ?? "friend"
  );

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    status = "pending";
    errorMessage = null;

    try {
      if (mode === "signIn") {
        await authClient.signIn.email({
          email: values.email,
          password: values.password,
        });
      } else {
        const username = values.username.trim();
        if (!username) {
          throw new Error("Please provide a username.");
        }

        await authClient.signUp.email({
          name: username,
          email: values.email,
          password: values.password,
        });
      }

      status = "success";
    } catch (error) {
      status = "error";
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.";
      errorMessage = message;
    }
  }

  async function handleSignOut() {
    isSigningOut = true;
    try {
      await authClient.signOut();
    } finally {
      isSigningOut = false;
    }
  }
</script>

{#if $session?.isPending && !$session?.data}
  <div class={`${containerClasses} items-center`}>
    <Card class="w-full max-w-md shadow-lg" aria-live="polite">
      <CardContent
        class="flex items-center gap-3 text-sm text-muted-foreground"
      >
        <span
          aria-hidden="true"
          class="h-2 w-2 animate-ping rounded-full bg-primary"
        ></span>
        <p>Loading your session…</p>
      </CardContent>
    </Card>
  </div>
{:else if activeSession}
  <div class={`${containerClasses} items-center`}>
    <Card aria-live="polite" class="w-full max-w-2xl shadow-lg">
      <CardHeader>
        <CardTitle>Welcome back, {displayName}!</CardTitle>
        <CardDescription>
          You are signed in and your Convex client is authenticated.
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            onclick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing Out..." : "Sign Out"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent class="space-y-3 text-sm text-muted-foreground">
        <p>
          Signed in as <span class="font-medium text-foreground"
            >{displayName}</span
          >.
        </p>
        {#if userDetails?.email}
          <p>
            Email: <span class="font-mono text-foreground"
              >{userDetails.email}</span
            >
          </p>
        {/if}
        {#if activeSession?.userId}
          <p class="break-all font-mono text-xs text-muted-foreground/90">
            User ID: <span class="text-foreground">{activeSession.userId}</span>
          </p>
        {/if}
        <p>
          You can now call Convex queries and mutations with this authenticated
          client.
        </p>
      </CardContent>
    </Card>
  </div>
{:else}
  <div class={containerClasses}>
    <div class="mx-auto max-w-2xl text-center">
      <h1 class="text-3xl font-semibold tracking-tight">
        Get started with Convex + Better Auth + Svelte + Astro
      </h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Sign in to browse protected data or create an account to begin.
      </p>
    </div>
    <div class="mx-auto w-full max-w-md space-y-4">
      <div
        role="group"
        aria-label="Authentication mode"
        class="flex justify-center gap-2"
      >
        <Button
          type="button"
          variant={mode === "signIn" ? "default" : "outline"}
          onclick={() => (mode = "signIn")}
          aria-pressed={mode === "signIn"}
        >
          Sign In
        </Button>
        <Button
          type="button"
          variant={mode === "signUp" ? "default" : "outline"}
          onclick={() => (mode = "signUp")}
          aria-pressed={mode === "signUp"}
        >
          Sign Up
        </Button>
      </div>
      <Card aria-busy={isPending} aria-live="polite" class="w-full shadow-lg">
        <CardHeader>
          <CardTitle>{copy.headline}</CardTitle>
          <CardDescription>{copy.helpText}</CardDescription>
        </CardHeader>
        <form
          class="space-y-6"
          onsubmit={(event) => handleSubmit(event as SubmitEvent)}
          novalidate
        >
          <CardContent class="space-y-4">
            <fieldset disabled={isPending} class="grid gap-4">
              {#if mode === "signUp"}
                <div class="grid gap-2">
                  <label
                    class="text-sm font-medium leading-none"
                    for={usernameId}
                  >
                    Username
                  </label>
                  <Input
                    id={usernameId}
                    type="text"
                    bind:value={values.username}
                    autocomplete="username"
                    placeholder="janedoe"
                    required
                  />
                  <p class="text-xs text-muted-foreground">
                    This is the name we'll show across the app.
                  </p>
                </div>
              {/if}
              <div class="grid gap-2">
                <label class="text-sm font-medium leading-none" for={emailId}>
                  Email
                </label>
                <Input
                  id={emailId}
                  type="email"
                  bind:value={values.email}
                  autocomplete="email"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div class="grid gap-2">
                <label
                  class="text-sm font-medium leading-none"
                  for={passwordId}
                >
                  Password
                </label>
                <Input
                  id={passwordId}
                  type="password"
                  bind:value={values.password}
                  autocomplete={mode === "signIn"
                    ? "current-password"
                    : "new-password"}
                  placeholder="••••••••"
                  required
                />
              </div>
            </fieldset>
          </CardContent>
          <CardFooter class="flex flex-col items-stretch gap-3">
            <Button
              type="submit"
              class="w-full"
              disabled={isPending}
              aria-describedby={showError || showSuccess
                ? statusMessageId
                : undefined}
            >
              {copy.submitLabel}
            </Button>
            {#if showError && errorMessage}
              <p
                id={statusMessageId}
                role="alert"
                class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
              >
                {errorMessage}
              </p>
            {:else if showSuccess}
              <p
                id={statusMessageId}
                role="status"
                class="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600"
              >
                Success! Check your inbox if you enrolled via email link.
              </p>
            {/if}
          </CardFooter>
        </form>
      </Card>
      {#if $session?.error}
        <p class="text-center text-sm text-destructive/80">
          {$session.error.message ?? "Unable to load the current session."}
        </p>
      {/if}
    </div>
  </div>
{/if}
