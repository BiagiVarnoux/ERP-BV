// src/hooks/useShareTarget.ts
// Consumo de los enlaces generados por <ShareButton />.
//
//  · Lee `?item=<id>` para resaltar/abrir un producto dentro del recurso.
//  · Si el recurso pertenece a OTRA empresa del usuario (Holding), cambia la
//    empresa activa automáticamente. La empresa destino se toma del propio
//    recurso ya cargado (no de la URL) y se valida contra la lista de empresas
//    del usuario, así que nunca puede llevar a una empresa ajena.

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useUserAccess } from '@/contexts/UserAccessContext';

export function useShareTarget(resourceCompanyId?: string): { itemId: string | null } {
  const [searchParams] = useSearchParams();
  const { companyId: activeCompanyId, companies, switchCompany } = useUserAccess();
  const switched = useRef(false);

  useEffect(() => {
    if (switched.current) return;
    if (!resourceCompanyId || !activeCompanyId) return;
    if (resourceCompanyId === activeCompanyId) return;
    // Solo empresas donde el usuario es miembro (lista blanca del contexto).
    const target = companies.find(c => c.company_id === resourceCompanyId);
    if (!target) return;
    switched.current = true;
    toast.info(`Cambiando a ${target.name}`, {
      description: 'Este registro pertenece a otra de tus empresas.',
    });
    switchCompany(target.company_id);
  }, [resourceCompanyId, activeCompanyId, companies, switchCompany]);

  return { itemId: searchParams.get('item') };
}
