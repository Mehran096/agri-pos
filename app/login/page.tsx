"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

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
        password: password,
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
    <div className="min-h-screen flex items-center justify-center bg-green-50 p-6">
      <form onSubmit={handleLogin} className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-7 space-y-4">
        <h1 className="text-2xl font-bold text-center text-green-700">Agri Shop</h1>
        
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl text-center">
            {error}
          </div>
        )}

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          required
          className="w-full border p-3.5 rounded-xl outline-none focus:border-green-600"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
          required
          className="w-full border p-3.5 rounded-xl outline-none focus:border-green-600"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white p-3.5 rounded-xl font-bold disabled:opacity-60 active:scale-[0.98] transition"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}