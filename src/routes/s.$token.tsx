import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { getPublicSite } from "@/lib/sites.functions";

export const Route = createFileRoute("/s/$token")({
  ssr: false,
  loader: async ({ params }) => {
    const site = await getPublicSite({ data: { token: params.token } });
    if (!site) throw notFound();
    return site;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? "Site compartilhado" },
      { name: "description", content: "Site criado com Buildable" },
    ],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen bg-[#0a0a0b] text-white grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Link inválido ou expirado</h1>
        <p className="text-white/60 mt-2 text-sm">
          Links compartilhados duram 7 dias.
        </p>
        <Link to="/" className="inline-block mt-6 rounded-full bg-white text-black px-4 py-2 text-sm">
          Ir para o início
        </Link>
      </div>
    </div>
  ),
  errorComponent: () => (
    <div className="min-h-screen bg-[#0a0a0b] text-white grid place-items-center p-6">
      Erro ao carregar o site.
    </div>
  ),
  component: SharedPage,
});

function SharedPage() {
  const site = Route.useLoaderData();
  return (
    <div className="h-screen w-screen bg-white">
      <iframe
        title={site.title}
        srcDoc={site.html}
        sandbox="allow-scripts"
        className="w-full h-full border-0"
      />
    </div>
  );
}