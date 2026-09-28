-- Tabela de sites salvos
CREATE TABLE public.sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Sem título',
  prompt TEXT,
  html TEXT NOT NULL DEFAULT '',
  share_token TEXT UNIQUE,
  share_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sites_user_id_idx ON public.sites(user_id);
CREATE INDEX sites_share_token_idx ON public.sites(share_token);

-- Grants (Data API não concede permissões por padrão)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated;
GRANT SELECT ON public.sites TO anon; -- necessário para leitura pública via share_token
GRANT ALL ON public.sites TO service_role;

-- RLS
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- O dono pode ver/gerenciar os próprios sites
CREATE POLICY "Owners manage own sites"
  ON public.sites
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Qualquer visitante (anon ou autenticado) pode ler um site
-- se ele tiver um share_token válido e não expirado
CREATE POLICY "Public read via valid share token"
  ON public.sites
  FOR SELECT
  TO anon, authenticated
  USING (
    share_token IS NOT NULL
    AND share_expires_at IS NOT NULL
    AND share_expires_at > now()
  );

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_sites_updated_at
  BEFORE UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();