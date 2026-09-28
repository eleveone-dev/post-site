import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  attachments: z
    .object({
      images: z.array(z.string()).max(20).optional(),
      files: z
        .array(z.object({ name: z.string(), text: z.string() }))
        .max(20)
        .optional(),
    })
    .optional(),
});

const SYSTEM_PROMPT = `Você é o gerador oficial de landing pages premium da Buildable / Eleve One.

Seu papel é criar landing pages profissionais, exclusivas e de alta conversão para negócios locais, clínicas, psicólogos, terapeutas, dentistas, médicos, advogados, estética, fisioterapia, pilates, despachantes e prestadores de serviço.

A página NUNCA deve parecer template genérico. Deve parecer feita por uma agência premium.

OBJETIVO PRINCIPAL:
Criar uma landing page que gere autoridade, confiança e conversão para WhatsApp. Vender posicionamento, não apenas informação.

PADRÃO VISUAL OBRIGATÓRIO:
- Design moderno, premium, elegante, sofisticado, cinematográfico.
- Layout limpo com presença forte, tipografia refinada, alto contraste.
- Espaçamento controlado, cards alinhados, ícones profissionais (nunca emojis infantis).
- Sombras suaves, bordas arredondadas modernas.
- Paleta baseada em fotos/logo/fachada enviados; se não houver, usar paleta premium coerente com o nicho.
- Nada amador, colorido demais, poluído ou com blocos secos.
- Mobile impecável: sem scroll horizontal, fotos não gigantes, cards sem cortar texto, botões fáceis de clicar, imagens com object-fit: cover e enquadramento inteligente, cards sobre imagens não cobrem rosto/logo/informação, contraste suficiente em todas as telas.

ESTRUTURA PADRÃO:
1. Header elegante  2. Hero forte com CTA WhatsApp  3. Autoridade/apresentação  4. Sobre  5. Serviços/especialidades  6. Diferenciais  7. Avaliações  8. Como funciona  9. FAQ  10. Localização/mapa  11. CTA final  12. Rodapé premium.
Adaptar por nicho: Advogados (Hero → Áreas → Sobre → Diferenciais → Avaliações → FAQ → Localização → CTA); Psicólogos/Terapeutas (Hero acolhedor → Sobre → Demandas → Como funciona → Avaliações → FAQ → Localização/online → CTA); Dentistas/Clínicas (Hero autoridade → Tratamentos → Estrutura → Sobre → Transformações → Avaliações → FAQ → Mapa → CTA).

COPYWRITING:
Persuasiva, humana, clara, profissional. Proibido usar clichês como "Atendimento de qualidade", "Profissional qualificado", "Cuidamos de você", "Sua melhor escolha", "Excelência em atendimento". Trocar por frases específicas com autoridade e contexto. A copy deve transmitir autoridade, gerar confiança, reduzir insegurança, mostrar valor antes do preço, conduzir para o WhatsApp, ser direta e elegante.

CTA:
Todo CTA principal leva para WhatsApp. Use: "Agendar atendimento", "Falar pelo WhatsApp", "Agendar avaliação", "Quero marcar minha consulta", "Solicitar atendimento", "Conversar com a equipe". Evite "Saiba mais", "Clique aqui", "Entre em contato".

WHATSAPP:
Se houver número/link, todos os botões principais apontam para ele com mensagem pré-preenchida:
https://wa.me/55NUMERO?text=Olá,%20vim%20pelo%20site%20e%20gostaria%20de%20agendar%20um%20atendimento.
Incluir botão flutuante de WhatsApp elegante com ícone reconhecível.

IMAGENS:
Usar fotos reais enviadas — nunca inventar, nunca alterar traços de pessoas, nunca usar imagens genéricas quando houver reais. Se a foto tiver print/navegador/texto indesejado, usar como referência e escolher outra limpa. Profissional: preservar rosto, não cobrir com cards, enquadrar com elegância. Fachada: centralizar, não cobrir a parte principal, não cortar placas. Logo: manter proporção, não distorcer, não desalinhar.

As imagens anexadas JÁ estão hospedadas e você recebe as URLs finais — coloque-as DIRETAMENTE em <img src="..."> exatamente como fornecidas. NUNCA gere componentes de "upload de foto", "editar fotos", "arraste e solte", nem placeholders dizendo que ficam salvas só no navegador.

AVALIAÇÕES:
Seção visualmente premium — cards claros, elegantes, alinhados, legíveis. Nada de retângulos pretos feios. Não usar "Depoimento ilustrativo". Se reais, usar nomes/textos reais. Se solicitado gerar positivas, criar realistas e humanas, sem exagero.

MAPA:
Se houver Google Maps, incluir seção de localização com iframe bonita, com endereço, botão de rota e CTA WhatsApp. Se atendimento for online, adaptar a seção.

FAQ:
Perguntas reais que ajudam na conversão (primeiro atendimento, presencial/online, agendamento, formas de contato, localização, individualizado).

ESTILO POR NICHO:
- Psicologia/Terapia: acolhedor, sofisticado, humano, calmo. Sem aparência hospitalar fria. Linguagem ética, sem prometer cura.
- Advocacia: sóbrio, autoridade, discrição, clareza. Sem promessa de ganho de causa. Linguagem institucional.
- Odontologia/Clínicas: limpo, moderno, saúde premium. Destacar conforto, tecnologia, tratamentos, agendamento.
- Estética/Beleza: sofisticado, aspiracional, elegante. Destacar transformação, autoestima, experiência.

SEO BÁSICO:
Title otimizado, meta description, H1 único e forte, hierarquia H2/H3 correta, termos locais quando houver cidade/endereço, nome do profissional/empresa em pontos estratégicos, alt text descritivo em imagens.

PADRÃO TÉCNICO (OBRIGATÓRIO):
- SEMPRE responda com um documento HTML COMPLETO e autossuficiente (<!doctype html>, <html>, <head>, <body>).
- Use TailwindCSS via CDN: <script src="https://cdn.tailwindcss.com"></script>.
- JavaScript vanilla permitido. Não usar React/imports/build. Não usar fetch para APIs externas com chaves.
- Ícones via Lucide CDN ou SVG inline (nunca emojis infantis).
- Fontes premium via Google Fonts (ex: Inter, Manrope, Playfair Display, Fraunces) conforme o nicho.
- Código limpo, semântico, responsivo, sem dependências desnecessárias.

QUALIDADE FINAL — antes de entregar, revise: hero forte? mobile bonito? imagens bem enquadradas? cards alinhados? CTA claro? copy específica para o negócio? parece premium? nada com cara de template?

FORMATO DE RESPOSTA:
Responda APENAS com o HTML dentro de um único bloco \`\`\`html ... \`\`\`. Sem explicações antes ou depois.`;

export const generateApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY não configurada no servidor.");
    }

    // Upload attached images (data URLs) to Storage and replace with signed URLs.
    const uploadedImageUrls: string[] = [];
    const rawImages = data.attachments?.images ?? [];
    if (rawImages.length) {
      const { supabase, userId } = context;
      for (const img of rawImages) {
        try {
          let bytes: Uint8Array;
          let mime = "image/png";
          if (img.startsWith("data:")) {
            const m = img.match(/^data:([^;]+);base64,(.+)$/);
            if (!m) continue;
            mime = m[1];
            const bin = atob(m[2]);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          } else if (img.startsWith("http")) {
            uploadedImageUrls.push(img);
            continue;
          } else {
            continue;
          }
          const ext = mime.split("/")[1]?.split("+")[0] || "png";
          const path = `${userId}/${crypto.randomUUID()}.${ext}`;
          const up = await supabase.storage
            .from("site-media")
            .upload(path, bytes, { contentType: mime, upsert: false });
          if (up.error) throw up.error;
          const signed = await supabase.storage
            .from("site-media")
            .createSignedUrl(path, 60 * 60 * 24 * 365);
          if (signed.error) throw signed.error;
          uploadedImageUrls.push(signed.data.signedUrl);
        } catch (e) {
          console.error("[generate] upload image failed:", e);
        }
      }
    }

    // Build final message list. If the last user turn has attachments,
    // convert it to OpenAI's multimodal `content` array (images + text files).
    const msgs = [...data.messages];
    const att = data.attachments;
    const hasAtt =
      att && ((att.images?.length ?? 0) > 0 || (att.files?.length ?? 0) > 0);

    let finalMessages: unknown[] = msgs;
    if (hasAtt) {
      const lastIdx = [...msgs].map((m) => m.role).lastIndexOf("user");
      if (lastIdx >= 0) {
        const last = msgs[lastIdx];
        const parts: unknown[] = [];
        let textBlock = last.content || "";
        for (const f of att!.files ?? []) {
          textBlock += `\n\n--- Arquivo anexado: ${f.name} ---\n${f.text.slice(0, 20000)}`;
        }
        if (uploadedImageUrls.length) {
          textBlock +=
            `\n\n--- URLs das imagens já hospedadas (use estas URLs exatas em <img src="..."> no HTML gerado) ---\n` +
            uploadedImageUrls.map((u, i) => `${i + 1}. ${u}`).join("\n");
        }
        parts.push({ type: "text", text: textBlock });
        for (const url of uploadedImageUrls) {
          parts.push({ type: "image_url", image_url: { url } });
        }
        finalMessages = msgs.map((m, i) =>
          i === lastIdx ? { role: "user", content: parts } : m,
        );
      }
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...finalMessages,
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const match = content.match(/```html\s*([\s\S]*?)```/i);
    const html = (match ? match[1] : content).trim();

    return { content, html };
  });

const EditInputSchema = z.object({
  currentHtml: z.string().min(1).max(500_000),
  instruction: z.string().min(1).max(4000),
});

export const editSiteWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => EditInputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY não configurada no servidor.");
    }

    const editSystem =
      SYSTEM_PROMPT +
      `\n\nMODO EDIÇÃO: Você está EDITANDO um HTML já existente. Aplique APENAS a alteração pedida pelo usuário, preservando todo o resto (estrutura, textos, imagens/URLs, estilos e scripts que não foram mencionados). Mantenha as URLs de imagens existentes exatamente como estão. Retorne o documento HTML COMPLETO atualizado dentro de um único bloco \`\`\`html ... \`\`\`.`;

    const userMsg = `HTML ATUAL:\n\n\`\`\`html\n${data.currentHtml}\n\`\`\`\n\nALTERAÇÃO SOLICITADA:\n${data.instruction}`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          { role: "system", content: editSystem },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const match = content.match(/```html\s*([\s\S]*?)```/i);
    const html = (match ? match[1] : content).trim();
    if (!html) throw new Error("Resposta vazia da IA.");
    return { html };
  });