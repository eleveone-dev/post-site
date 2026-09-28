import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Eleve One — Acesso ao criador de sites" },
      {
        name: "description",
        content: "Entre na sua conta Eleve One para criar e publicar sites com IA.",
      },
      { property: "og:title", content: "Eleve One — Acesso ao criador de sites" },
      {
        property: "og:description",
        content: "Entre na sua conta Eleve One para criar e publicar sites com IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      navigate({ to: data.user ? "/app" : "/auth", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white grid place-items-center">
      <div className="flex items-center gap-2 text-sm text-white/50">
        <span className="h-2 w-2 rounded-full bg-fuchsia-400 animate-pulse" />
        Carregando…
      </div>
    </div>
  );
}
