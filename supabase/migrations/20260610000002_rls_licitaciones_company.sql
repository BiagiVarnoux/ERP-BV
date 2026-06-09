-- Fase 1 (complemento): Migrar RLS de licitaciones a company_id
-- Las policies anteriores usaban auth.uid() = user_id, bloqueando
-- a miembros invitados de ver licitaciones creadas por otros.

-- ─── licitaciones ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner CRUD licitaciones" ON public.licitaciones;

CREATE POLICY "company_member_all" ON public.licitaciones
  FOR ALL USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

-- ─── licitacion_productos ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner CRUD licitacion_productos" ON public.licitacion_productos;

CREATE POLICY "company_member_all" ON public.licitacion_productos
  FOR ALL USING (
    licitacion_id IN (
      SELECT l.id FROM public.licitaciones l
      WHERE l.company_id IN (
        SELECT cm.company_id FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    licitacion_id IN (
      SELECT l.id FROM public.licitaciones l
      WHERE l.company_id IN (
        SELECT cm.company_id FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  );

-- ─── licitacion_documentos ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owner CRUD licitacion_documentos" ON public.licitacion_documentos;

CREATE POLICY "company_member_all" ON public.licitacion_documentos
  FOR ALL USING (
    licitacion_id IN (
      SELECT l.id FROM public.licitaciones l
      WHERE l.company_id IN (
        SELECT cm.company_id FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    licitacion_id IN (
      SELECT l.id FROM public.licitaciones l
      WHERE l.company_id IN (
        SELECT cm.company_id FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
      )
    )
  );
