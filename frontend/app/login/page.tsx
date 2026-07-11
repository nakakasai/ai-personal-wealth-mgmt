"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const API_BASE = "http://localhost:8000";

const SAMPLE_CHART_DATA = [
  { name: "Food", value: 32, color: "#FBBF24" },
  { name: "Transport", value: 24, color: "#60A5FA" },
  { name: "Shopping", value: 20, color: "#A78BFA" },
  { name: "Entertainment", value: 16, color: "#F472B6" },
  { name: "Others", value: 8, color: "#10B981" },
];

function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-3.2 3.9" />
      <path d="M6.6 6.6A16 16 0 0 0 2.5 12s3.5 6 9.5 6a10 10 0 0 0 4.4-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Login failed");
      }

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-white font-sans">
      {/* Left: brand panel (desktop only) */}
      <aside className="hidden lg:flex relative flex-col justify-between p-12 text-white overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.15) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.12) 0, transparent 45%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center">
            <span className="text-white text-base font-semibold">₹</span>
          </div>
          <span className="text-sm font-semibold tracking-wide">
            AI Finance Manager
          </span>
        </div>

        <div className="relative max-w-md flex flex-col items-center">
          <h2 className="text-3xl xl:text-4xl font-semibold tracking-tight leading-tight mb-8 text-center">
            Understand where your money goes.
          </h2>

          <div className="w-full mb-8">
            <div className="mx-auto" style={{ width: "240px", height: "240px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={SAMPLE_CHART_DATA}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {SAMPLE_CHART_DATA.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
              {SAMPLE_CHART_DATA.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-indigo-100">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-indigo-100/90 text-[15px] leading-relaxed text-center">
            Automatically categorize transactions, track trends, and get AI-powered insights into your spending patterns.
          </p>
        </div>

        <p className="relative text-xs text-indigo-200/80">
          © {new Date().getFullYear()} AI Finance Manager
        </p>
      </aside>

      {/* Right: form panel */}
      <section className="flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-[400px] max-w-full">
          {/* Brand mark for mobile (hidden on desktop since aside shows it) */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-200">
              <span className="text-white text-base font-semibold">₹</span>
            </div>
            <span className="text-sm font-semibold text-slate-900 tracking-wide">
              AI Finance Manager
            </span>
          </div>

          <header className="mb-8">
            <h1 className="text-[28px] leading-tight font-semibold text-slate-900 tracking-tight">
              Sign in to your account
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Welcome back. Enter your credentials to continue.
            </p>
          </header>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2.5 rounded-lg"
            >
              <span aria-hidden className="mt-0.5">⚠</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="email"
                className="block text-[13px] font-medium text-slate-700 mb-1.5"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="text-[13px] font-medium text-slate-700"
                >
                  Password
                </label>
                <a
                  href="#"
                  className="text-[13px] font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Forgot password?
                </a>
              </div>
              <div className="flex items-center h-11 rounded-lg border border-slate-300 bg-white pl-3.5 pr-1.5 focus-within:ring-4 focus-within:ring-indigo-100 focus-within:border-indigo-500 transition">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="flex-1 min-w-0 h-full bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none border-0 p-0"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  aria-pressed={showPassword}
                  className="ml-1 shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition"
                >
                  {showPassword ? (
                    <EyeOffIcon className="h-[18px] w-[18px]" />
                  ) : (
                    <EyeIcon className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-[15px] font-medium text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm shadow-indigo-200 focus:outline-none focus:ring-4 focus:ring-indigo-200 transition"
            >
              {loading && (
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <a
              href="/signup"
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Create one
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
