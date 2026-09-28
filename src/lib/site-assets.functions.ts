import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  dataUrl: z.string().min(20).max(15_000_000), // ~15MB base64
  filename: z.string().max(120).optional(),
});

export const uploadSiteAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const m = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("Formato inválido — esperado data URL base64.");
    const mime = m[1];
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.split("/")[1]?.split("+")[0] || "bin";
    const path = `${userId}/visual/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage
      .from("site-media")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) throw new Error(up.error.message);
    const signed = await supabase.storage
      .from("site-media")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl };
  });