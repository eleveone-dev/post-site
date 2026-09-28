import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Buildable — Redefinir senha" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("A senha precisa ter ao menos 6 caracteres.");
    if (password !== confirm) return setError("As senhas não conferem.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/app" }), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar senha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white grid place-items-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-gradient-to-br from-fuchsia-500/20 via-violet-500/15 to-cyan-400/10 blur-3xl" />
      <div className="relative z-10 w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 grid place-items-center font-black">B</div>
          <span className="font-semibold">Buildable</span>
        </Link>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-6">
          <h1 className="text-xl font-semibold text-center">Redefinir senha</h1>
          <p className="text-sm text-white/50 text-center mt-1">Escolha uma nova senha para sua conta.</p>
          {!ready ? (
            <p className="mt-6 text-xs text-white/60 text-center">
              Abra este link a partir do email de recuperação. Se você chegou aqui direto, peça um novo link em <Link to="/auth" className="underline">/auth</Link>.
            </p>
          ) : done ? (
            <div className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200 text-center">
              Senha atualizada! Redirecionando…
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-3">
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Nova senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
              />
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Confirmar senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/30"
              />
              {error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 px-3 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {loading ? "…" : "Atualizar senha"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}