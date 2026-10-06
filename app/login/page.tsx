"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async () => {
    setLoading(true);
    await signIn("credentials", {
      email: email,
      password: password,
      callbackUrl: "/dashboard",
    });
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-7 space-y-4">
        <h1 className="text-2xl font-bold text-center text-green-700">Agri Shop</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full border p-3.5 rounded-xl" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="w-full border p-3.5 rounded-xl" />
        <button onClick={handleLogin} disabled={loading} className="w-full bg-green-600 text-white p-3.5 rounded-xl font-bold disabled:opacity-60">
          {loading ? "Logging in..." : "Login"}
        </button>
      </div>
    </div>
  );
}