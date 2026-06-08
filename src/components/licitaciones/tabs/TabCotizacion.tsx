// src/components/licitaciones/tabs/TabCotizacion.tsx
// Dispatcher: selecciona el cotizador según la configuración de la empresa.
// Para agregar un nuevo tipo: 1) crear cotizadores/CotizadorXxx.tsx, 2) agregar case aquí.

import React from 'react';
import { Licitacion } from '@/accounting/licitacion-types';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { CotizadorImportacion } from '../cotizadores/CotizadorImportacion';
import { Package2 } from 'lucide-react';

interface Props {
  licitacion: Licitacion;
  onUpdated: (l: Licitacion) => void;
}

export function TabCotizacion({ licitacion, onUpdated }: Props) {
  const { getModuleConfigValue } = useUserAccess();
  const tipo = getModuleConfigValue('licitaciones.cotizador_type') ?? 'importacion';

  switch (tipo) {
    case 'importacion':
      return <CotizadorImportacion licitacion={licitacion} onUpdated={onUpdated} />;

    default:
      return <CotizadorNoConfigurado tipo={tipo} />;
  }
}

// ─── Placeholder para tipos no implementados ───────────────────────────────────

function CotizadorNoConfigurado({ tipo }: { tipo: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
      <Package2 className="h-10 w-10 mb-4 opacity-30" />
      <p className="font-medium">Cotizador «{tipo}» no implementado</p>
      <p className="text-xs mt-1 max-w-xs">
        Configura el tipo de cotizador en Ajustes → Módulos o contacta al administrador.
      </p>
    </div>
  );
}
