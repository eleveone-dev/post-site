import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getMySite } from "@/lib/sites.functions";

const VisualEditor = lazy(() => import("@/components/VisualEditor"));

export const Route = createFileRoute("/_authenticated/visual/$id")({
  head: () => ({ meta: [{ title: "Buildable — Editor Visual" }] }),
  component: VisualPage,
});

function VisualPage() {
  const { id } = Route.useParams();
  const getSiteFn = useServerFn(getMySite);
  const [site, setSite] = useState<{
    id: string;
    title: string;
    html: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSiteFn({ data: { id } })
      .then((s) => setSite({ id: s.id, title: s.title, html: s.html }))
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar"));
  }, [id, getSiteFn]);

  if (error) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0b] text-white grid place-items-center p-6 text-center">
        <div>
          <p className="text-red-300 text-sm">{error}</p>
          <Link to="/app" className="mt-4 inline-block text-white/60 underline">
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0b] text-white grid place-items-center">
        <div className="text-sm text-white/60">Carregando editor…</div>
      </div>
    );
  }

  return (
    <ClientOnly
      fallback={
        <div className="h-screen w-screen bg-[#0a0a0b] text-white grid place-items-center">
          <div className="text-sm text-white/60">Carregando editor…</div>
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="h-screen w-screen bg-[#0a0a0b] text-white grid place-items-center">
            <div className="text-sm text-white/60">Inicializando GrapesJS…</div>
          </div>
        }
      >
        <VisualEditor
          siteId={site.id}
          initialTitle={site.title}
          initialHtml={site.html}
        />
      </Suspense>
    </ClientOnly>
  );
}