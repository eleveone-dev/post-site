import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { generateApp } from "@/lib/generate.functions";
import { importArchive } from "@/lib/import-archive.functions";
import {
  listMySites,
  saveSite,
  deleteSite,
  getMySite,
  publishSite,
  unpublishSite,
} from "@/lib/sites.functions";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  p: z.string().optional(),
  id: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Buildable — Editor" }] }),
  component: AppPage,
});

type Msg = { role: "user" | "assistant"; content: string };

type Attachment =
  | { kind: "image"; name: string; dataUrl: string }
  | { kind: "file"; name: string; text: string }
  | { kind: "archive"; name: string; file: File };

const MAX_ATTACHMENTS = 20;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_FILE_BYTES = 200 * 1024; // 200KB text
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_ARCHIVE_ENTRIES = 300;
const MAX_ARCHIVE_TOTAL_BYTES = 20 * 1024 * 1024; // 20MB uncompressed

function isArchiveFile(f: File): "zip" | "rar" | null {
  const name = (f.name || "").toLowerCase();
  if (name.endsWith(".zip") || f.type === "application/zip") return "zip";
  if (
    name.endsWith(".rar") ||
    f.type === "application/vnd.rar" ||
    f.type === "application/x-rar-compressed"
  )
    return "rar";
  return null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(bin);
}

type ExtractedEntry = { path: string; bytes: Uint8Array };

async function extractZip(file: File): Promise<ExtractedEntry[]> {
  const { unzipSync } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const unzipped = unzipSync(buf);
  const out: ExtractedEntry[] = [];
  for (const [name, data] of Object.entries(unzipped)) {
    if (!name || name.endsWith("/")) continue;
    if (name.startsWith("__MACOSX/") || name.endsWith("/.DS_Store") || name === ".DS_Store") continue;
    out.push({ path: name, bytes: data as Uint8Array });
  }
  return out;
}

async function extractRar(file: File): Promise<ExtractedEntry[]> {
  const mod: any = await import("libarchive.js");
  const Archive = mod.Archive ?? mod.default?.Archive ?? mod.default;
  Archive.init({
    workerUrl: new URL(
      "libarchive.js/dist/worker-bundle.js",
      import.meta.url,
    ).toString(),
  });
  const archive = await Archive.open(file);
  const filesObj = await archive.extractFiles();
  const out: ExtractedEntry[] = [];
  const walk = async (node: any, prefix: string) => {
    for (const [key, value] of Object.entries(node)) {
      const p = prefix ? `${prefix}/${key}` : key;
      if (value instanceof File || (value as any)?.arrayBuffer) {
        const buf = new Uint8Array(await (value as File).arrayBuffer());
        out.push({ path: p, bytes: buf });
      } else if (value && typeof value === "object") {
        await walk(value, p);
      }
    }
  };
  await walk(filesObj, "");
  return out;
}

async function extractArchive(file: File): Promise<ExtractedEntry[]> {
  const kind = isArchiveFile(file);
  if (kind === "zip") return extractZip(file);
  if (kind === "rar") return extractRar(file);
  throw new Error("Formato não suportado. Envie .zip ou .rar.");
}

// Domínio público usado nos links de compartilhamento publicados.
// Usa a origem atual (mesmo domínio onde a rota /s/$token existe),
// evitando 404 quando o domínio configurado no código não aponta pra cá.
function getPublicShareBase(): string {
  return window.location.origin;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function extractHtml(text: string): string | null {
  const m = text.match(/```html\s*([\s\S]*?)```/i);
  const html = (m ? m[1] : text).trim();
  return html.toLowerCase().includes("<html") ? html : null;
}

function titleFromPrompt(prompt: string): string {
  const t = prompt.trim().split("\n")[0].slice(0, 60);
  return t || "Sem título";
}

function AppPage() {
  const { p, id } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const generate = useServerFn(generateApp);
  const importArchiveFn = useServerFn(importArchive);
  const saveFn = useServerFn(saveSite);
  const deleteFn = useServerFn(deleteSite);
  const publishFn = useServerFn(publishSite);
  const unpublishFn = useServerFn(unpublishSite);
  const getSiteFn = useServerFn(getMySite);
  const listFn = useServerFn(listMySites);

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: () => listFn(),
  });

  const [siteId, setSiteId] = useState<string | undefined>(id);
  const [title, setTitle] = useState("Sem título");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareExpires, setShareExpires] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(false);
  const loadedIdRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize composer textarea (64px min, 220px max).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(220, Math.max(64, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [input, attachments.length]);

  // Load existing site when ?id=
  useEffect(() => {
    if (!id || loadedIdRef.current === id) return;
    loadedIdRef.current = id;
    getSiteFn({ data: { id } }).then((s) => {
      setSiteId(s.id);
      setTitle(s.title);
      setHtml(s.html);
      setShareToken(s.share_token);
      setShareExpires(s.share_expires_at);
      setMessages(
        s.prompt
          ? [{ role: "user", content: s.prompt }, { role: "assistant", content: "✅ Site carregado." }]
          : [],
      );
    }).catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar"));
  }, [id, getSiteFn]);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const next: Attachment[] = [];
    for (const f of list) {
      if (attachments.length + next.length >= MAX_ATTACHMENTS) break;
      const archiveKind = isArchiveFile(f);
      if (archiveKind) {
        if (f.size > MAX_ARCHIVE_BYTES) {
          setError(`Pacote "${f.name}" excede 25MB.`);
          continue;
        }
        next.push({
          kind: "archive",
          name: f.name || `pacote.${archiveKind}`,
          file: f,
        });
      } else if (f.type.startsWith("image/")) {
        if (f.size > MAX_IMAGE_BYTES) {
          setError(`Imagem "${f.name}" excede 5MB.`);
          continue;
        }
        try {
          const dataUrl = await readAsDataURL(f);
          next.push({ kind: "image", name: f.name || "imagem.png", dataUrl });
        } catch {
          setError(`Falha ao ler "${f.name}".`);
        }
      } else {
        if (f.size > MAX_FILE_BYTES) {
          setError(`Arquivo "${f.name}" excede 200KB (apenas texto pequeno).`);
          continue;
        }
        try {
          const text = await readAsText(f);
          next.push({ kind: "file", name: f.name || "arquivo.txt", text });
        } catch {
          setError(`Falha ao ler "${f.name}".`);
        }
      }
    }
    if (next.length) setAttachments((a) => [...a, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const removeAttachment = (i: number) =>
    setAttachments((a) => a.filter((_, idx) => idx !== i));

  const sendArchive = async (
    att: Attachment & { kind: "archive" },
    note: string,
  ) => {
    setError(null);
    const userContent =
      note.trim() ||
      `Importar site do pacote "${att.name}" exatamente como está.`;
    const next: Msg[] = [
      ...messages,
      { role: "user", content: userContent },
      { role: "assistant", content: `📦 Extraindo "${att.name}"…` },
    ];
    setMessages(next);
    setInput("");
    setAttachments([]);
    setLoading(true);
    try {
      const entries = await extractArchive(att.file);
      if (!entries.length) throw new Error("Pacote vazio.");
      if (entries.length > MAX_ARCHIVE_ENTRIES) {
        throw new Error(
          `Muitos arquivos (${entries.length}). Máx ${MAX_ARCHIVE_ENTRIES}.`,
        );
      }
      const total = entries.reduce((s, e) => s + e.bytes.byteLength, 0);
      if (total > MAX_ARCHIVE_TOTAL_BYTES) {
        throw new Error(
          `Conteúdo extraído tem ${(total / 1024 / 1024).toFixed(1)}MB (máx ${MAX_ARCHIVE_TOTAL_BYTES / 1024 / 1024}MB).`,
        );
      }
      const payloadFiles = entries.map((e) => ({
        path: e.path,
        contentBase64: bytesToBase64(e.bytes),
      }));
      const res = await importArchiveFn({ data: { files: payloadFiles } });
      setHtml(res.html);
      const nextTitle =
        title === "Sem título" && !siteId
          ? att.name.replace(/\.(zip|rar)$/i, "").slice(0, 60) ||
            "Site importado"
          : title;
      if (nextTitle !== title) setTitle(nextTitle);
      setMessages((m) => [
        ...m.slice(0, -1),
        {
          role: "assistant",
          content: `✅ Site importado (${res.assetCount} arquivos, principal: ${res.mainHtmlPath}). Pronto para publicar.`,
        },
      ]);
      try {
        const firstUser = next.find((m) => m.role === "user")?.content;
        const saved = await saveFn({
          data: {
            id: siteId,
            title: nextTitle,
            prompt: firstUser,
            html: res.html,
          },
        });
        if (!siteId) {
          setSiteId(saved.id);
          navigate({ to: "/app", search: { id: saved.id }, replace: true });
        }
        await qc.invalidateQueries({ queryKey: ["sites"] });
      } catch (e) {
        console.error("[autosave archive] failed", e);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao importar pacote";
      setError(msg);
      setMessages((m) => [
        ...m.slice(0, -1),
        { role: "assistant", content: `⚠️ ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const send = async (text: string) => {
    const content = text.trim();
    if ((!content && attachments.length === 0) || loading) return;
    const archiveAtt = attachments.find((a) => a.kind === "archive") as
      | (Attachment & { kind: "archive" })
      | undefined;
    if (archiveAtt) {
      await sendArchive(archiveAtt, content);
      return;
    }
    setError(null);
    const userContent =
      content ||
      (attachments.length
        ? `Use ${attachments.length === 1 ? "este anexo" : "estes anexos"} como referência para gerar/atualizar o site.`
        : "");
    const next: Msg[] = [...messages, { role: "user", content: userContent }];
    setMessages(next);
    setInput("");
    const sentAtt = attachments;
    setAttachments([]);
    setLoading(true);
    try {
      const res = await generate({
        data: {
          messages: next,
          attachments: sentAtt.length
            ? {
                images: sentAtt.filter((a) => a.kind === "image").map((a) => (a as any).dataUrl),
                files: sentAtt
                  .filter((a) => a.kind === "file")
                  .map((a) => ({ name: a.name, text: (a as any).text })),
              }
            : undefined,
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.content }]);
      const parsed = extractHtml(res.html || res.content);
      if (parsed) setHtml(parsed);
      const nextTitle =
        title === "Sem título" && !siteId && content ? titleFromPrompt(content) : title;
      if (nextTitle !== title) setTitle(nextTitle);
      // Autosave: persist immediately so refresh/edit doesn't lose the site.
      if (parsed) {
        try {
          const firstUser = next.find((m) => m.role === "user")?.content;
          const res2 = await saveFn({
            data: { id: siteId, title: nextTitle, prompt: firstUser, html: parsed },
          });
          if (!siteId) {
            setSiteId(res2.id);
            navigate({ to: "/app", search: { id: res2.id }, replace: true });
          }
          await qc.invalidateQueries({ queryKey: ["sites"] });
        } catch (e) {
          console.error("[autosave] failed", e);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setError(msg);
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (p && !startedRef.current) {
      startedRef.current = true;
      setTitle(titleFromPrompt(p));
      send(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleSave = async () => {
    if (!html) {
      setError("Gere um site antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const firstUser = messages.find((m) => m.role === "user")?.content;
      const res = await saveFn({
        data: { id: siteId, title, prompt: firstUser, html },
      });
      setSiteId(res.id);
      await qc.invalidateQueries({ queryKey: ["sites"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    let id = siteId;
    if (!id) {
      const firstUser = messages.find((m) => m.role === "user")?.content;
      const res = await saveFn({ data: { title, prompt: firstUser, html } });
      id = res.id;
      setSiteId(id);
      await qc.invalidateQueries({ queryKey: ["sites"] });
    }
    if (!id) return;
    setPublishing(true);
    try {
      const res = await publishFn({ data: { id } });
      setShareToken(res.token);
      setShareExpires(res.expiresAt);
      const url = `${getPublicShareBase()}/s/${res.token}`;
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

  const handleUnpublish = async () => {
    if (!siteId) return;
    await unpublishFn({ data: { id: siteId } });
    setShareToken(null);
    setShareExpires(null);
    await qc.invalidateQueries({ queryKey: ["sites"] });
  };

  const handleDelete = async (targetId: string) => {
    if (!confirm("Apagar este site?")) return;
    await deleteFn({ data: { id: targetId } });
    await qc.invalidateQueries({ queryKey: ["sites"] });
    if (targetId === siteId) newSite();
  };

  const newSite = () => {
    setSiteId(undefined);
    setTitle("Sem título");
    setHtml("");
    setMessages([]);
    setShareToken(null);
    setShareExpires(null);
    loadedIdRef.current = undefined;
    startedRef.current = false;
    navigate({ to: "/app", search: {} });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const shareUrl = shareToken ? `${getPublicShareBase()}/s/${shareToken}` : null;

  return (
    <div className="h-screen w-screen bg-[#0a0a0b] text-white flex flex-col">
      <header className="flex items-center justify-between px-4 py-2 border-b border-white/5 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-600 grid place-items-center font-black text-sm">
              B
            </div>
            <span className="font-semibold text-sm hidden sm:inline">Buildable</span>
          </Link>
          <div className="h-5 w-px bg-white/10" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-transparent text-sm px-2 py-1 rounded hover:bg-white/5 focus:bg-white/5 outline-none min-w-0 max-w-[200px]"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5 text-sm">
          <button
            onClick={() => setTab("preview")}
            className={`px-3 py-1 rounded-md ${tab === "preview" ? "bg-white text-black" : "text-white/70 hover:text-white"}`}
          >
            Preview
          </button>
          <button
            onClick={() => setTab("code")}
            className={`px-3 py-1 rounded-md ${tab === "code" ? "bg-white text-black" : "text-white/70 hover:text-white"}`}
          >
            Código
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !html}
            className="text-sm rounded-md border border-white/10 hover:bg-white/5 px-3 py-1.5 disabled:opacity-40"
          >
            {saving ? "Salvando…" : siteId ? "Salvar" : "Salvar"}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing || !html}
            className="text-sm rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-600 px-3 py-1.5 disabled:opacity-40"
          >
            {publishing ? "Publicando…" : "Publicar"}
          </button>
          <button
            onClick={signOut}
            className="text-xs text-white/50 hover:text-white px-2"
            title="Sair"
          >
            Sair
          </button>
        </div>
      </header>

      {shareUrl && (
        <div className="px-4 py-2 border-b border-white/5 bg-emerald-500/5 text-xs flex items-center gap-3">
          <span className="text-emerald-300">🔗 Publicado por 7 dias:</span>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="text-white/90 hover:underline truncate flex-1"
          >
            {shareUrl}
          </a>
          <button
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rounded border border-white/10 px-2 py-0.5 hover:bg-white/5"
          >
            {copied ? "Copiado!" : "Copiar"}
          </button>
          <button
            onClick={handleUnpublish}
            className="text-white/50 hover:text-white"
          >
            Despublicar
          </button>
        </div>
      )}

      <div className="flex-1 grid md:grid-cols-[220px_360px_1fr] grid-cols-1 min-h-0">
        {/* Sidebar */}
        <aside className="border-r border-white/5 flex flex-col min-h-0 hidden md:flex">
          <button
            onClick={newSite}
            className="m-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 py-2 text-sm"
          >
            + Novo site
          </button>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-white/40 px-2 py-1">
              Meus sites
            </div>
            {sites.length === 0 && (
              <div className="text-xs text-white/40 px-2">
                Nada salvo ainda.
              </div>
            )}
            {sites.map((s) => {
              const active = s.id === siteId;
              const published =
                s.share_token &&
                s.share_expires_at &&
                new Date(s.share_expires_at) > new Date();
              return (
                <div
                  key={s.id}
                  className={`group rounded-md px-2 py-1.5 text-sm flex items-center gap-2 cursor-pointer ${
                    active ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                  onClick={() => navigate({ to: "/app", search: { id: s.id } })}
                >
                  <span className="truncate flex-1">{s.title}</span>
                  {published && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Publicado" />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({ to: "/visual/$id", params: { id: s.id } });
                    }}
                    className="text-white/40 hover:text-fuchsia-300 opacity-0 group-hover:opacity-100 text-xs"
                    title="Editar visualmente (arrastar e soltar)"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(s.id);
                    }}
                    className="text-white/30 hover:text-red-300 opacity-0 group-hover:opacity-100 text-xs"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Chat */}
        <div className="flex flex-col border-r border-white/5 min-h-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="text-sm text-white/40">
                Descreva o que você quer construir. A IA gera um HTML completo e
                mostra no preview.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm rounded-xl px-3 py-2 max-w-[95%] ${
                  m.role === "user"
                    ? "bg-white/10 ml-auto"
                    : "bg-gradient-to-br from-fuchsia-500/10 to-violet-600/10 border border-white/5"
                }`}
              >
                {m.role === "assistant" ? (
                  <span className="text-white/80">
                    {m.content.length > 300 ? "✅ Site atualizado no preview." : m.content}
                  </span>
                ) : (
                  m.content
                )}
              </div>
            ))}
            {loading && (
              <div className="text-sm text-white/60 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-fuchsia-400 animate-pulse" />
                Gerando com gpt-5…
              </div>
            )}
            {error && (
              <div className="text-xs rounded-md border border-red-500/30 bg-red-500/10 p-2 text-red-200">
                {error}
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-3 border-t border-white/5"
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              if (e.currentTarget === e.target) setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
          >
            <div
              className={`rounded-2xl border bg-[#141416] shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] p-2.5 transition-all ${
                dragOver
                  ? "border-fuchsia-400 bg-fuchsia-500/10"
                  : "border-white/10 focus-within:border-white/25"
              }`}
            >
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 p-1 pb-2">
                  {attachments.map((a, i) => (
                    <div
                      key={i}
                      className="group relative rounded-lg border border-white/10 bg-black/30 overflow-hidden"
                    >
                      {a.kind === "image" ? (
                        <img
                          src={a.dataUrl}
                          alt={a.name}
                          className="h-14 w-14 object-cover"
                        />
                      ) : a.kind === "archive" ? (
                        <div className="h-14 px-2 flex items-center gap-2 text-xs text-white/80 max-w-[200px]">
                          <span>🗜️</span>
                          <span className="truncate">{a.name}</span>
                        </div>
                      ) : (
                        <div className="h-14 px-2 flex items-center gap-2 text-xs text-white/70 max-w-[160px]">
                          <span>📄</span>
                          <span className="truncate">{a.name}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/70 text-white text-[10px] leading-none opacity-0 group-hover:opacity-100"
                        title="Remover"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!loading && (input.trim() || attachments.length > 0)) {
                      send(input);
                    }
                  }
                }}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  const files: File[] = [];
                  for (const it of Array.from(items)) {
                    if (it.kind === "file") {
                      const f = it.getAsFile();
                      if (f) files.push(f);
                    }
                  }
                  if (files.length) {
                    e.preventDefault();
                    addFiles(files);
                  }
                }}
                rows={1}
                placeholder={
                  dragOver
                    ? "Solte para anexar…"
                    : html
                    ? "Peça uma alteração… (Shift+Enter para nova linha)"
                    : "Descreva o site que você quer criar… (Shift+Enter para nova linha)"
                }
                style={{ minHeight: 64, maxHeight: 220 }}
                className="w-full bg-transparent px-3 py-2.5 outline-none resize-none text-sm leading-relaxed placeholder:text-white/30 transition-[height] duration-150 ease-out overflow-y-auto"
              />
              <div className="flex items-center justify-between gap-2 px-1 pt-1.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.zip,.rar,.txt,.md,.json,.csv,.html,.css,.js,.ts,.tsx,.jsx,.yml,.yaml,.xml,.svg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-white/10 hover:bg-white/10 h-9 w-9 grid place-items-center text-white/70 shrink-0 transition"
                title="Anexar arquivo ou imagem"
              >
                📎
              </button>
              <button
                type="submit"
                disabled={loading || (!input.trim() && attachments.length === 0)}
                className="rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 px-4 py-2 text-sm font-medium disabled:opacity-40 hover:opacity-90 transition shrink-0"
              >
                {loading ? "Gerando…" : "Enviar"}
              </button>
              </div>
            </div>
          </form>
        </div>

        {/* Preview / Code */}
        <div className="min-h-0 bg-white/[0.02]">
          {tab === "preview" ? (
            html ? (
              <iframe
                title="preview"
                srcDoc={html}
                sandbox="allow-scripts"
                className="w-full h-full bg-white"
              />
            ) : (
              <div className="h-full grid place-items-center text-white/40 text-sm p-8 text-center">
                {loading ? "Preparando seu site…" : "O preview vai aparecer aqui."}
              </div>
            )
          ) : (
            <pre className="h-full w-full overflow-auto p-4 text-xs text-white/80 font-mono">
              {html || "// nenhum código gerado ainda"}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
