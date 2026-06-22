// src/hooks/useProductCategories.ts
// Categorías de inventario definidas en Configuración (tabla product_categories),
// scoped a la empresa activa. Fuente única para los dropdowns de categoría.
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

export interface ProductCategoryRow {
  id: string;
  codigo: string;
  nombre: string;
}

export function useProductCategories() {
  const companyId = useActiveCompanyId();
  const [categories, setCategories] = useState<ProductCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setCategories([]); setLoading(false); return; }
    let active = true;
    setLoading(true);
    supabase
      .from('product_categories')
      .select('id, codigo, nombre')
      .eq('company_id', companyId)
      .order('nombre')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { console.error('Error cargando categorías', error); setCategories([]); }
        else setCategories((data ?? []).map((r: { id: string; codigo: string | null; nombre: string }) => ({
          id: r.id, codigo: (r.codigo ?? '').trim(), nombre: r.nombre,
        })));
        setLoading(false);
      });
    return () => { active = false; };
  }, [companyId]);

  return { categories, loading };
}
