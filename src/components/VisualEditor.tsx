import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { saveSite, publishSite } from "@/lib/sites.functions";
import { uploadSiteAsset } from "@/lib/site-assets.functions";
import { editSiteWithAI } from "@/lib/generate.functions";
import "grapesjs/dist/css/grapes.min.css";

type Props = {
  siteId: string;
  initialTitle: string;
  initialHtml: string;
};

function getPublicShareBase(): string {
  return "https://sites.eleveone.com.br";
}

export default function VisualEditor({ siteId, initialTitle, initialHtml }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const saveFn = useServerFn(saveSite);
  const publishFn = useServerFn(publishSite);
  const uploadFn = useServerFn(uploadSiteAsset);
  const aiEditFn = useServerFn(editSiteWithAI);

  const holderRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<{ html: string; css: string } | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const [{ default: grapesjs }, presetWebpage, blocksBasic, pluginForms] = await Promise.all([
        import("grapesjs"),
        import("grapesjs-preset-webpage"),
        import("grapesjs-blocks-basic"),
        import("grapesjs-plugin-forms"),
      ]);
      if (disposed || !holderRef.current) return;

      const editor = grapesjs.init({
        container: holderRef.current,
        height: "100%",
        width: "auto",
        storageManager: false,
        fromElement: false,
        components: initialHtml || "<section style='padding:80px;text-align:center;font-family:sans-serif'><h1>Comece a editar</h1></section>",
        canvas: {
          scripts: ["https://cdn.tailwindcss.com"],
        },
        plugins: [
          (blocksBasic as any).default ?? blocksBasic,
          (pluginForms as any).default ?? pluginForms,
          (presetWebpage as any).default ?? presetWebpage,
        ],
        pluginsOpts: {
          "grapesjs-preset-webpage": { showStylesOnChange: true },
        },
        assetManager: {
          uploadFile: async (e: any) => {
            const files: File[] = Array.from(
              e.dataTransfer?.files || e.target?.files || [],
            );
            for (const f of files) {
              try {
                const dataUrl = await new Promise<string>((res, rej) => {
                  const r = new FileReader();
                  r.onload = () => res(String(r.result));
                  r.onerror = () => rej(r.error);
                  r.readAsDataURL(f);
                });
                const { url } = await uploadFn({ data: { dataUrl, filename: f.name } });
                editor.AssetManager.add([{ src: url, name: f.name, type: "image" }]);
              } catch (err) {
                console.error("upload asset failed", err);
                setError(err instanceof Error ? err.message : "Falha ao subir imagem");
              }
            }
          },
        },
      });

      editorRef.current = editor;
      setReady(true);
    })().catch((e) => {
      console.error(e);
      setError(e instanceof Error ? e.message : "Erro ao carregar editor");
    });

    return () => {
      disposed = true;
      try {
        editorRef.current?.destroy?.();
      } catch {}
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildHtml = (): string => {
    const ed = editorRef.current;
    if (!ed) return initialHtml;
    const html = ed.getHtml();
    const css = ed.getCss();
    return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title.replace(/</g, "&lt;")}</title><script src="https://cdn.tailwindcss.com"></script><style>${css}</style></head><body>${html}</body></html>`;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const html = buildHtml();
      await saveFn({ data: { id: siteId, title, html } });
      await qc.invalidateQueries({ queryKey: ["sites"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const html = buildHtml();
      await saveFn({ data: { id: siteId, title, html } });
      const res = await publishFn({ data: { id: siteId } });
      const url = `${getPublicShareBase()}/s/${res.token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await qc.invalidateQueries({ queryKey: ["sites"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao publicar");
    } finally {
      setPublishing(false);
    }
  };

  const applyDocToEditor = (doc: string) => {
    const ed = editorRef.current;
    if (!ed) return;
    let bodyHtml = doc;
    let cssText = "";
    try {
      const parsed = new DOMParser().parseFromString(doc, "text/html");
      bodyHtml = parsed.body?.innerHTML || doc;
      cssText = Array.from(parsed.querySelectorAll("style"))
        .map((s) => s.textContent || "")
        .join("\n");
    } catch {}
    ed.Components.clear();
    ed.CssComposer.clear();
    ed.setComponents(bodyHtml);
    if (cssText) ed.setStyle(cssText);
  };

  const handleAiEdit = async () => {
    const ed = editorRef.current;
    const instruction = aiPrompt.trim();
    if (!ed || !instruction || aiLoading) return;
    setAiLoading(true);
    setError(null);
    try {
      const snapshot = { html: ed.getHtml(), css: ed.getCss() };
      const currentHtml = buildHtml();
      const res = await aiEditFn({ data: { currentHtml, instruction } });
      setLastSnapshot(snapshot);
      applyDocToEditor(res.html);
      setAiPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao alterar com IA");
    } finally {
      setAiLoading(false);
    }
  };

  const handleUndoAi = () => {
    const ed = editorRef.current;
    if (!ed || !lastSnapshot) return;
    ed.Components.clear();
    ed.CssComposer.clear();
    ed.setComponents(lastSnapshot.html);
    if (lastSnapshot.css) ed.setStyle(lastSnapshot.css);
    setLastSnapshot(null);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0b] text-white">
      <header className="flex items-center justify-between px-4 py-2 border-b border-white/10 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate({ to: "/app", search: { id: siteId } })}
            className="text-sm rounded-md border border-white/10 hover:bg-white/5 px-3 py-1.5"
          >
            ← Voltar
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-sm px-2 py-1 rounded hover:bg-white/5 focus:bg-white/5 outline-none min-w-0 max-w-[280px]"
          />
          <span className="text-xs text-white/40 hidden md:inline">Editor Visual</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiOpen((v) => !v)}
            className="text-sm rounded-md border border-white/10 hover:bg-white/5 px-3 py-1.5"
            title="Alterar com IA"
          >
            {aiOpen ? "✨ IA ▸" : "✨ Alterar com IA"}
          </button>
          {shareUrl && (
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-300 hover:underline truncate max-w-[240px]"
            >
              {copied ? "🔗 Copiado!" : shareUrl}
            </a>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !ready}
            className="text-sm rounded-md border border-white/10 hover:bg-white/5 px-3 py-1.5 disabled:opacity-40"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || !ready}
            className="text-sm rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-600 px-3 py-1.5 disabled:opacity-40"
          >
            {publishing ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </header>
      {error && (
        <div className="px-4 py-1.5 text-xs bg-red-500/10 border-b border-red-500/30 text-red-200">
          {error}
        </div>
      )}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 bg-white text-black">
          <div ref={holderRef} className="h-full w-full" />
        </div>
        {aiOpen && (
          <aside className="w-[320px] shrink-0 border-l border-white/10 bg-[#0f0f11] flex flex-col">
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-medium text-white/80">✨ Alterar com IA</span>
              {lastSnapshot && (
                <button
                  onClick={handleUndoAi}
                  className="text-[11px] text-white/50 hover:text-white underline"
                >
                  Desfazer
                </button>
              )}
            </div>
            <div className="p-3 flex-1 flex flex-col gap-2 min-h-0">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAiEdit();
                  }
                }}
                placeholder="Ex: mude o hero para fundo escuro, troque o título para ..., adicione seção de depoimentos..."
                className="flex-1 min-h-[140px] resize-none rounded-md bg-[#141416] border border-white/10 focus:border-fuchsia-500/50 outline-none text-sm p-3 text-white placeholder:text-white/30"
                disabled={aiLoading || !ready}
              />
              <button
                onClick={handleAiEdit}
                disabled={aiLoading || !ready || !aiPrompt.trim()}
                className="rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-600 px-3 py-2 text-sm disabled:opacity-40"
              >
                {aiLoading ? "Aplicando alteração…" : "Aplicar alteração"}
              </button>
              <p className="text-[11px] text-white/40 leading-relaxed">
                A IA recebe o HTML atual e retorna o site atualizado. Enter envia, Shift+Enter quebra linha. Você continua podendo editar visualmente depois.
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}