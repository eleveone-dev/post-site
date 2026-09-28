# Eleve One - Post Site

Aplicacao TanStack Start com Supabase, hospedada de forma independente em uma VPS.

## Desenvolvimento

1. Copie `.env.example` para `.env` e preencha as variaveis do Supabase.
2. Instale dependencias com `npm install`.
3. Execute `npm run dev`.

## Producao

```bash
npm ci
npm run build
NODE_ENV=production HOST=127.0.0.1 PORT=3000 node .output/server/index.mjs
```

Use os modelos em `deploy/` para systemd e Nginx. Os valores de `.env` nunca devem ser enviados ao Git; na VPS, armazene-os em `/etc/post-site/post-site.env` com permissao `600`.
