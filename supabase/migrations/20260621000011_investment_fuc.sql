-- Factor de Utilización de Capital (FUC) por análisis: tiempo activo / tiempo total.
-- Usado para el ROI anualizado REALISTA, que descuenta el tiempo muerto entre
-- ciclos (agotados, capital retenido en aduana, ventas lentas) frente al ROI
-- anualizado TEÓRICO (reinversión continua sin fricción). 100% = teórico.
ALTER TABLE public.investment_analyses
  ADD COLUMN IF NOT EXISTS fuc_pct numeric NOT NULL DEFAULT 75
    CHECK (fuc_pct > 0 AND fuc_pct <= 100);
