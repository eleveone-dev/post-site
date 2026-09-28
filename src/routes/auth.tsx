import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Eleve One — Entrar" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/app" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/app" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("Se existir uma conta com esse email, enviamos um link de recuperação.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white grid place-items-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-gradient-to-br from-fuchsia-500/20 via-violet-500/15 to-cyan-400/10 blur-3xl" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 grid place-items-center font-black">
            E
          </div>
          <span className="font-semibold">Eleve One</span>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-6">
          <h1 className="text-xl font-semibold text-center">
            {mode === "signin" ? "Entrar na sua conta" : "Recuperar senha"}
          </h1>
          <p className="text-sm text-white/50 text-center mt-1">
            {mode === "signin"
              ? "Bem-vindo de volta."
              : "Enviaremos um link para redefinir sua senha."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
            />
            {mode !== "forgot" && (
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
            />
            )}
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
                {error}
              </div>
            )}
            {info && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">
                {info}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 px-3 py-2.5 text-sm font-medium disabled:opacity-40"
            >
              {loading ? "…" : mode === "signin" ? "Entrar" : "Enviar link"}
            </button>
          </form>
          <div className="mt-4 flex flex-col gap-2 items-center text-xs text-white/60">
            <button
              onClick={() => {
                setMode(mode === "signin" ? "forgot" : "signin");
                setError(null);
                setInfo(null);
              }}
              className="hover:text-white"
            >
              {mode === "signin" ? "Esqueci minha senha" : "Voltar para o login"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}