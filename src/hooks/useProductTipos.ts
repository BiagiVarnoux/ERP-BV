// src/hooks/useProductTipos.ts
// Tipos de inventario (prefijo del SKU: ELE/PED/LIC/...) definidos en
// Configuración (tabla product_tipos_inventario), scoped a la empresa activa.
// Reemplaza la lista fija que antes vivía en accounting/product-condicion.ts.
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

export interface ProductTipoRow {
  id: string;
  valor: string;
  nombre: string;
  codigo: string;
}

const DEFAULT_TIPOS: Array<{ valor: string; nombre: string; codigo: string }> = [
  { valor: 'electronica',  nombre: 'Electrónica',  codigo: 'ELE' },
  { valor: 'pedido',       nombre: 'A Pedido',      codigo: 'PED' },
  { valor: 'licitaciones', nombre: 'Licitaciones',  codigo: 'LIC' },
];

async function loadRows(companyId: string) {
  const { data, error } = await supabase
    .from('product_tipos_inventario')
    .select('id, valor, nombre, codigo')
    .eq('company_id', companyId)
    .order('nombre');
  if (error) throw error;
  return (data ?? []) as ProductTipoRow[];
}

export function useProductTipos() {
  const companyId = useActiveCompanyId();
  const [tipos, setTipos] = useState<ProductTipoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setTipos([]); setLoading(false); return; }
    let active = true;
    (async () => {
      setLoading(true);
      try {
        let rows = await loadRows(companyId);
        // Primera vez: sembrar los 3 tipos por defecto y recargar.
        if (rows.length === 0) {
          await supabase.from('product_tipos_inventario').insert(
            DEFAULT_TIPOS.map(t => ({ company_id: companyId, ...t }))
          );
          rows = await loadRows(companyId);
        }
        if (active) setTipos(rows);
      } catch (e) {
        console.error('Error cargando tipos de inventario', e);
        if (active) setTipos([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [companyId]);

  return { tipos, loading };
}
