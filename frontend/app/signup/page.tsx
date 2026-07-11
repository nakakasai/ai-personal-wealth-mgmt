"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = "http://localhost:8000";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Signup failed");
      }

      router.push("/login");
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-200 mb-3">
            <span className="text-white text-xl font-bold">₹</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Create your account
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Start using your AI Finance Manager
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          {error && (
            <div className="mb-4 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg">
              <span aria-hidden>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-16 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Confirm password
              </label>
              <input
                type={showPassword ? "text" : "password"}
                className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition ${
                  passwordsMismatch
                    ? "border-rose-300 focus:ring-rose-200 focus:border-rose-400"
                    : "border-slate-200 focus:ring-indigo-200 focus:border-indigo-400"
                }`}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
              />
              {passwordsMismatch && (
                <p className="text-xs text-rose-600 mt-1">
                  Passwords don&apos;t match
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-indigo-200 transition"
            >
              {loading && (
                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loading ? "Creating account..." : "Sign up"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <a
            href="/login"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Log in
          </a>
        </p>
      </div>
    </main>
  );
}
