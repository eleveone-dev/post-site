import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FileSchema = z.object({
  path: z.string().min(1).max(1024),
  contentBase64: z.string(),
  mime: z.string().max(200).optional(),
});

const InputSchema = z.object({
  files: z.array(FileSchema).min(1).max(300),
  mainHtmlPath: z.string().optional(),
});

const TEXT_EXT_MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  xml: "application/xml",
  txt: "text/plain",
  webmanifest: "application/manifest+json",
  map: "application/json",
};

const BINARY_EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

function extOf(path: string): string {
  const clean = path.split("?")[0].split("#")[0];
  const i = clean.lastIndexOf(".");
  if (i < 0) return "";
  return clean.slice(i + 1).toLowerCase();
}

function guessMime(path: string, fallback?: string): string {
  const ext = extOf(path);
  return (
    TEXT_EXT_MIME[ext] ||
    BINARY_EXT_MIME[ext] ||
    fallback ||
    "application/octet-stream"
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function textToBytes(txt: string): Uint8Array {
  return new TextEncoder().encode(txt);
}

// Normalize a path: strip leading ./ and /, collapse //, remove leading segments.
function normalizePath(p: string): string {
  let s = p.replace(/\\/g, "/").trim();
  while (s.startsWith("./")) s = s.slice(2);
  while (s.startsWith("/")) s = s.slice(1);
  return s;
}

// Resolve a possibly-relative reference (from an HTML/CSS file) against
// the referrer's directory. Returns a normalized project-root path.
function resolveRef(ref: string, referrerDir: string): string {
  if (/^(https?:|data:|mailto:|tel:|blob:|about:|#|javascript:)/i.test(ref)) {
    return "";
  }
  const cleanRef = ref.split("?")[0].split("#")[0];
  if (!cleanRef) return "";
  if (cleanRef.startsWith("/")) return normalizePath(cleanRef);
  const dir = referrerDir ? referrerDir.split("/").filter(Boolean) : [];
  const parts = cleanRef.split("/");
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") dir.pop();
    else dir.push(part);
  }
  return dir.join("/");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Rewrites a text (HTML or CSS) by resolving every referenced path against
// `referrerPath`'s directory and replacing with the signed URL if known.
function rewriteReferences(
  source: string,
  referrerPath: string,
  urlMap: Map<string, string>,
): string {
  const referrerDir = referrerPath.includes("/")
    ? referrerPath.slice(0, referrerPath.lastIndexOf("/"))
    : "";

  // 1) Attribute values: src="...", href="...", data-src="...", poster="..."
  const attrRegex =
    /(\b(?:src|href|data-src|poster|action|formaction)\s*=\s*)("([^"]*)"|'([^']*)')/gi;
  let out = source.replace(attrRegex, (_m, pre, _q, dq, sq) => {
    const raw = dq ?? sq ?? "";
    const resolved = resolveRef(raw, referrerDir);
    if (resolved && urlMap.has(resolved)) {
      return `${pre}"${urlMap.get(resolved)}"`;
    }
    return `${pre}"${raw}"`;
  });

  // 2) srcset="a.png 1x, b.png 2x"
  out = out.replace(
    /(\bsrcset\s*=\s*)("([^"]*)"|'([^']*)')/gi,
    (_m, pre, _q, dq, sq) => {
      const raw = dq ?? sq ?? "";
      const rewritten = raw
        .split(",")
        .map((part: string) => {
          const trimmed = part.trim();
          if (!trimmed) return part;
          const [ref, ...rest] = trimmed.split(/\s+/);
          const resolved = resolveRef(ref, referrerDir);
          if (resolved && urlMap.has(resolved)) {
            return [urlMap.get(resolved), ...rest].join(" ");
          }
          return part;
        })
        .join(", ");
      return `${pre}"${rewritten}"`;
    },
  );

  // 3) CSS url(...) — supports url("x"), url('x'), url(x)
  out = out.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (_m, _q, raw: string) => {
      const resolved = resolveRef(raw, referrerDir);
      if (resolved && urlMap.has(resolved)) {
        return `url("${urlMap.get(resolved)}")`;
      }
      return `url(${raw})`;
    },
  );

  return out;
}

function pickMainHtml(paths: string[], hint?: string): string | null {
  const normalized = paths.map((p) => normalizePath(p));
  if (hint) {
    const h = normalizePath(hint);
    if (normalized.includes(h)) return h;
  }
  const htmls = normalized.filter((p) => /\.html?$/i.test(p));
  if (!htmls.length) return null;
  const rootIndex = htmls.find((p) => /^index\.html?$/i.test(p));
  if (rootIndex) return rootIndex;
  const anyIndex = htmls
    .filter((p) => /(^|\/)index\.html?$/i.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (anyIndex) return anyIndex;
  return htmls.sort((a, b) => a.split("/").length - b.split("/").length)[0];
}

export const importArchive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const importId = crypto.randomUUID();
    const basePath = `${userId}/import-${importId}`;

    // Normalize input paths (dedupe by normalized path).
    const seen = new Set<string>();
    const files = data.files
      .map((f) => ({ ...f, path: normalizePath(f.path) }))
      .filter((f) => {
        if (!f.path || f.path.endsWith("/")) return false;
        if (seen.has(f.path)) return false;
        seen.add(f.path);
        return true;
      });

    if (!files.length) throw new Error("Nenhum arquivo válido no pacote.");

    const mainHtml = pickMainHtml(files.map((f) => f.path), data.mainHtmlPath);
    if (!mainHtml) throw new Error("Nenhum arquivo .html encontrado no pacote.");

    const urlMap = new Map<string, string>();

    // Helper: upload bytes and record signed URL.
    const uploadAsset = async (relPath: string, bytes: Uint8Array, mime: string) => {
      const objectPath = `${basePath}/${relPath}`;
      const up = await supabase.storage
        .from("site-media")
        .upload(objectPath, bytes, { contentType: mime, upsert: false });
      if (up.error) throw new Error(`upload ${relPath}: ${up.error.message}`);
      const signed = await supabase.storage
        .from("site-media")
        .createSignedUrl(objectPath, 60 * 60 * 24 * 365);
      if (signed.error) throw new Error(`sign ${relPath}: ${signed.error.message}`);
      urlMap.set(relPath, signed.data.signedUrl);
    };

    // Pass 1: upload all non-HTML, non-CSS assets first.
    for (const f of files) {
      if (f.path === mainHtml) continue;
      const ext = extOf(f.path);
      if (ext === "html" || ext === "htm" || ext === "css") continue;
      const mime = guessMime(f.path, f.mime);
      try {
        const bytes = base64ToBytes(f.contentBase64);
        await uploadAsset(f.path, bytes, mime);
      } catch (e) {
        console.error("[import-archive] asset failed:", f.path, e);
      }
    }

    // Pass 2: rewrite CSS files (their url(...) refs use pass-1 URLs), upload them.
    for (const f of files) {
      const ext = extOf(f.path);
      if (ext !== "css") continue;
      try {
        const bytes = base64ToBytes(f.contentBase64);
        const text = bytesToText(bytes);
        const rewritten = rewriteReferences(text, f.path, urlMap);
        await uploadAsset(f.path, textToBytes(rewritten), "text/css");
      } catch (e) {
        console.error("[import-archive] css failed:", f.path, e);
      }
    }

    // Pass 3: rewrite auxiliary HTML files (not the main one) and upload,
    // so they can be linked to via <a href> and still work.
    for (const f of files) {
      const ext = extOf(f.path);
      if ((ext !== "html" && ext !== "htm") || f.path === mainHtml) continue;
      try {
        const bytes = base64ToBytes(f.contentBase64);
        const text = bytesToText(bytes);
        const rewritten = rewriteReferences(text, f.path, urlMap);
        await uploadAsset(f.path, textToBytes(rewritten), "text/html");
      } catch (e) {
        console.error("[import-archive] html asset failed:", f.path, e);
      }
    }

    // Pass 4: rewrite the main HTML (uses full URL map, incl. CSS + sub-HTML).
    const mainFile = files.find((f) => f.path === mainHtml)!;
    const mainBytes = base64ToBytes(mainFile.contentBase64);
    const mainText = bytesToText(mainBytes);
    const finalHtml = rewriteReferences(mainText, mainHtml, urlMap);

    return {
      html: finalHtml,
      mainHtmlPath: mainHtml,
      assetCount: urlMap.size,
    };
  });