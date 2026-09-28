-- Slugs legibles para las URLs de licitaciones y análisis de inversión.
--
-- Objetivo: reemplazar `/licitaciones/<uuid>` por `/licitaciones/ministerio-de-la-
-- presidencia-98-ssds`. El slug se deriva del `nombre`, es único POR EMPRESA
-- (compound con company_id, no global, siguiendo la regla multi-empresa) y se
-- regenera al renombrar (la lógica de generación/dedupe vive en el cliente,
-- ver src/lib/slug.ts). El índice único es el respaldo atómico anti-colisión.
--
-- Backup: no requiere cambios. Cliente (fetchAllCompanyRows → select *) y
-- servidor (build_company_backup → to_jsonb) arrastran la columna nueva solos.

-- ─── slugify(text) ────────────────────────────────────────────────────────────
-- Normaliza acentos (sin depender de la extensión unaccent), pasa a minúsculas y
-- deja solo [a-z0-9-]. Nunca devuelve cadena vacía (cae a 'item').
CREATE OR REPLACE FUNCTION public.slugify(txt text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(
      trim(both '-' from
        regexp_replace(
          lower(
            translate(
              COALESCE(txt, ''),
              'áàäâãÁÀÄÂÃéèëêÉÈËÊíìïîÍÌÏÎóòöôõÓÒÖÔÕúùüûÚÙÜÛñÑçÇ',
              'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUnNcC'
            )
          ),
          '[^a-z0-9]+', '-', 'g'
        )
      ),
      ''
    ),
    'item'
  );
$$;

-- ─── Columnas ─────────────────────────────────────────────────────────────────
ALTER TABLE public.licitaciones         ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.investment_analyses  ADD COLUMN IF NOT EXISTS slug text;

-- ─── Backfill: slug del nombre, deduplicado por empresa ──────────────────────
-- La primera coincidencia por (empresa, slug base) conserva el slug base; las
-- siguientes reciben sufijo -2, -3, … por orden de creación.
WITH numbered AS (
  SELECT
    id,
    public.slugify(nombre) AS base,
    row_number() OVER (
      PARTITION BY company_id, public.slugify(nombre)
      ORDER BY created_at, id
    ) AS rn
  FROM public.licitaciones
  WHERE slug IS NULL
)
UPDATE public.licitaciones l
SET slug = CASE WHEN n.rn = 1 THEN n.base ELSE n.base || '-' || n.rn END
FROM numbered n
WHERE l.id = n.id;

WITH numbered AS (
  SELECT
    id,
    public.slugify(nombre) AS base,
    row_number() OVER (
      PARTITION BY company_id, public.slugify(nombre)
      ORDER BY created_at, id
    ) AS rn
  FROM public.investment_analyses
  WHERE slug IS NULL
)
UPDATE public.investment_analyses a
SET slug = CASE WHEN n.rn = 1 THEN n.base ELSE n.base || '-' || n.rn END
FROM numbered n
WHERE a.id = n.id;

-- ─── Índices únicos por empresa (parcial: filas sin slug no colisionan) ───────
CREATE UNIQUE INDEX IF NOT EXISTS licitaciones_company_slug_uidx
  ON public.licitaciones (company_id, slug)
  WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investment_analyses_company_slug_uidx
  ON public.investment_analyses (company_id, slug)
  WHERE slug IS NOT NULL;
