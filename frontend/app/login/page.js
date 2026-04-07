"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, LogIn, UserPlus } from "lucide-react";
import { getBrowserSupabaseClient } from "../../lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("signin");

  useEffect(() => {
    let active = true;

    getBrowserSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        if (data.session) {
          router.replace("/");
        }
      })
      .catch(() => null);

    return () => {
      active = false;
    };
  }, [router]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    setMessage("");

    try {
      const supabase = getBrowserSupabaseClient();
      const emailValue = email.trim();
      let error = null;

      if (mode === "signup") {
        ({ error } = await supabase.auth.signUp({
          email: emailValue,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        }));
      } else {
        ({ error } = await supabase.auth.signInWithPassword({
          email: emailValue,
          password,
        }));
      }

      if (error) throw error;

      if (mode === "signup") {
        setMessage("Account created. Check your email if Supabase confirmation is enabled, then sign in.");
        setMode("signin");
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch (error) {
      setMessage(error?.message || (mode === "signup" ? "Failed to create account." : "Failed to sign in."));
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    setMessage("");

    try {
      const supabase = getBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (error) {
      setMessage(error?.message || "Failed to start Google sign-in.");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[75vh] w-full max-w-md items-center justify-center">
      <div className="glass w-full space-y-6 rounded-[2rem] p-6 md:p-7">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Secure Access</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Sign in to MeMo</h1>
          <p className="text-sm text-zinc-400">
            Sign in with your email or Google so your watch history and settings stay tied to your account.
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`rounded-[1rem] px-3 py-2 text-sm transition ${
              mode === "signin" ? "bg-cyan-300 text-zinc-950" : "text-zinc-300 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-[1rem] px-3 py-2 text-sm transition ${
              mode === "signup" ? "bg-cyan-300 text-zinc-950" : "text-zinc-300 hover:text-white"
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-zinc-300">Email</span>
            <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3">
              <Mail size={16} className="text-zinc-500" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="h-12 w-full bg-transparent text-sm outline-none"
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-zinc-300">Password</span>
            <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3">
              <Lock size={16} className="text-zinc-500" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="h-12 w-full bg-transparent text-sm outline-none"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 text-sm font-medium text-zinc-950 transition hover:bg-cyan-200 disabled:opacity-70"
          >
            {mode === "signup" ? <UserPlus size={16} /> : <LogIn size={16} />}
            {loading ? "Working..." : mode === "signup" ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-[0.2em] text-zinc-500">
            <span className="bg-zinc-950 px-3">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-950/70 px-4 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900 disabled:opacity-70"
        >
          Continue with Google
        </button>

        {message ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-300">
            {message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
