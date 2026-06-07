// src/components/licitaciones/LicitacionDetalle.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Licitacion, LicitacionEstado, LICITACION_ESTADO_LABELS, LICITACION_ESTADO_COLORS } from '@/accounting/licitacion-types';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import { TabCotizacion } from './tabs/TabCotizacion';
import { TabDocumentos } from './tabs/TabDocumentos';
import { TabProceso } from './tabs/TabProceso';
import { TabGeneral } from './tabs/TabGeneral';

interface Props {
  licitacion: Licitacion;
  onBack: () => void;
  onUpdated: (l: Licitacion) => void;
  onReload: () => Promise<void>;
}

const ESTADOS_ORDEN: LicitacionEstado[] = [
  'BORRADOR', 'PRESENTADA', 'ADJUDICADA', 'PERDIDA', 'DESIERTA', 'ENTREGADA', 'COBRADA',
];

export function LicitacionDetalle({ licitacion, onBack, onUpdated, onReload }: Props) {
  const [changingEstado, setChangingEstado] = useState(false);

  const handleEstadoChange = async (nuevoEstado: LicitacionEstado) => {
    try {
      setChangingEstado(true);
      await LicitacionStorage.update(licitacion.id, { estado: nuevoEstado });
      onUpdated({ ...licitacion, estado: nuevoEstado });
      toast.success(`Estado actualizado a ${LICITACION_ESTADO_LABELS[nuevoEstado]}`);
    } catch {
      toast.error('Error al cambiar el estado');
    } finally {
      setChangingEstado(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="mt-0.5 shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold truncate">{licitacion.nombre}</h1>
            <Badge className={`shrink-0 text-xs ${LICITACION_ESTADO_COLORS[licitacion.estado]}`}>
              {LICITACION_ESTADO_LABELS[licitacion.estado]}
            </Badge>
          </div>
          {(licitacion.entidad || licitacion.numero_sicoes) && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {licitacion.entidad}
              {licitacion.entidad && licitacion.numero_sicoes && ' · '}
              <span className="font-mono">{licitacion.numero_sicoes}</span>
            </p>
          )}
        </div>

        {/* Cambio de estado rápido */}
        <Select
          value={licitacion.estado}
          onValueChange={(v) => handleEstadoChange(v as LicitacionEstado)}
          disabled={changingEstado}
        >
          <SelectTrigger className="w-[160px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS_ORDEN.map(e => (
              <SelectItem key={e} value={e}>{LICITACION_ESTADO_LABELS[e]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="cotizacion">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="cotizacion">Cotización</TabsTrigger>
          <TabsTrigger value="documentos">
            Documentos
            {licitacion.documentos.length > 0 && (
              <span className="ml-1.5 text-xs bg-primary/20 text-primary rounded-full px-1.5 py-0.5">
                {licitacion.documentos.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="proceso">Proceso</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        <TabsContent value="cotizacion" className="mt-4">
          <TabCotizacion
            licitacion={licitacion}
            onUpdated={onUpdated}
          />
        </TabsContent>

        <TabsContent value="documentos" className="mt-4">
          <TabDocumentos
            licitacion={licitacion}
            onReload={onReload}
            onUpdated={onUpdated}
          />
        </TabsContent>

        <TabsContent value="proceso" className="mt-4">
          <TabProceso
            licitacion={licitacion}
            onUpdated={onUpdated}
          />
        </TabsContent>

        <TabsContent value="general" className="mt-4">
          <TabGeneral
            licitacion={licitacion}
            onUpdated={onUpdated}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
