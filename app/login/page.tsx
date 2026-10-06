"use client";
import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password");
      } else if (res?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Login failed, try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#f6fef8] p-4">
      <div className="w-full max-w-90">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600 text-white text-xl font-black shadow-md">
            S
          </div>
          <h1 className="mt-3 text-[22px] font-bold tracking-tight text-gray-900">
            Sona Fertilizer Shop
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">Sales & Stock Manager</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-white rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.06)] border border-gray-100 p-5 space-y-4"
        >
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase ml-1">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@shop.com"
                type="email"
                required
                autoComplete="email"
                className="mt-1.5 w-full border border-gray-200 bg-gray-50/50 p-3.5 rounded-xl text-[14px] outline-none focus:bg-white focus:border-green-600 focus:ring-4 focus:ring-green-600/10 transition"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase ml-1">
                Password
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="mt-1.5 w-full border border-gray-200 bg-gray-50/50 p-3.5 rounded-xl text-[14px] outline-none focus:bg-white focus:border-green-600 focus:ring-4 focus:ring-green-600/10 transition"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-[13px] p-3 rounded-xl text-center font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 text-white p-3.5 rounded-xl font-bold text-[14px] disabled:opacity-60 active:scale-[0.98] transition shadow-[0_6px_20px_rgba(22,163,74,0.3)]"
          >
            {loading? "Logging in..." : "Login to Shop"}
          </button>

          <p className="text-center text-[11px] text-gray-400 pt-1">
            Secure • Private per shop • PWA Ready
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh flex items-center justify-center bg-[#f6fef8]">
          <div className="h-10 w-10 rounded-full border-2 border-green-600 border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}