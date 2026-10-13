"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ signupAllowed, githubEnabled }: { signupAllowed: boolean; githubEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const res =
      mode === "in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(form.get("name") || email.split("@")[0]) });
    setPending(false);
    if (res.error) return setError(res.error.message ?? "Couldn't sign in");
    router.replace("/");
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="space-y-5">
        {mode === "up" && (
          <label className="block">
            <span className="meta">Name</span>
            <input name="name" className="field" autoComplete="name" />
          </label>
        )}
        <label className="block">
          <span className="meta">Email</span>
          <input name="email" type="email" required className="field" autoComplete="email" />
        </label>
        <label className="block">
          <span className="meta">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="field"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
          />
        </label>
        {error && <p className="text-sm text-accent">{error}</p>}
        <div className="flex items-center gap-4 pt-2">
          <button className="btn btn-accent" disabled={pending}>
            {mode === "in" ? "Sign in" : "Create account"}
          </button>
          {signupAllowed && (
            <button
              type="button"
              className="meta link"
              onClick={() => {
                setMode(mode === "in" ? "up" : "in");
                setError(null);
              }}
            >
              {mode === "in" ? "New here? Create account" : "Have an account? Sign in"}
            </button>
          )}
        </div>
      </form>
      {githubEnabled && (
        <div className="mt-10 border-t border-rule pt-6">
          <button
            className="btn"
            onClick={() => authClient.signIn.social({ provider: "github", callbackURL: "/" })}
          >
            Continue with GitHub
          </button>
        </div>
      )}
    </div>
  );
}
