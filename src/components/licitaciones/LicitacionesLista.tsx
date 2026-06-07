// src/components/licitaciones/LicitacionesLista.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Search, Trash2, ChevronRight, FileText } from 'lucide-react';
import { Licitacion, LicitacionEstado, LICITACION_ESTADO_LABELS, LICITACION_ESTADO_COLORS, TIPO_PROCESO_LABELS } from '@/accounting/licitacion-types';
import { fmt } from '@/accounting/utils';
import { NuevaLicitacionModal } from './NuevaLicitacionModal';

interface Props {
  licitaciones: Licitacion[];
  loading: boolean;
  onCreated: (lit: Licitacion) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}

const ESTADOS_ACTIVOS: LicitacionEstado[] = ['BORRADOR', 'PRESENTADA', 'ADJUDICADA'];
const ESTADOS_CERRADOS: LicitacionEstado[] = ['PERDIDA', 'DESIERTA', 'ENTREGADA', 'COBRADA'];

export function LicitacionesLista({ licitaciones, loading, onCreated, onDelete, onOpen }: Props) {
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Licitacion | null>(null);

  const filtered = licitaciones.filter(l => {
    const matchSearch = !search ||
      l.nombre.toLowerCase().includes(search.toLowerCase()) ||
      l.entidad.toLowerCase().includes(search.toLowerCase()) ||
      l.numero_sicoes.toLowerCase().includes(search.toLowerCase());
    const matchEstado = filtroEstado === 'TODOS' || l.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

  const activas  = filtered.filter(l => ESTADOS_ACTIVOS.includes(l.estado));
  const cerradas = filtered.filter(l => ESTADOS_CERRADOS.includes(l.estado));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Licitaciones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {licitaciones.length} proceso{licitaciones.length !== 1 ? 's' : ''} registrado{licitaciones.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva Licitación
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, entidad, N° SICOES..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos los estados</SelectItem>
            {Object.entries(LICITACION_ESTADO_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : licitaciones.length === 0 ? (
        <EmptyState onNew={() => setShowModal(true)} />
      ) : (
        <div className="space-y-8">
          {/* Activas */}
          {activas.length > 0 && (
            <Section titulo="Activas" items={activas} onOpen={onOpen} onDelete={setDeleteTarget} />
          )}
          {/* Cerradas */}
          {cerradas.length > 0 && (
            <Section titulo="Historial" items={cerradas} onOpen={onOpen} onDelete={setDeleteTarget} dimmed />
          )}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Sin resultados para la búsqueda.</p>
          )}
        </div>
      )}

      <NuevaLicitacionModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={lit => { setShowModal(false); onCreated(lit); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar licitación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{deleteTarget?.nombre}» y todos sus documentos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { onDelete(deleteTarget.id); setDeleteTarget(null); } }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sección agrupada ──────────────────────────────────────────────────────────

function Section({ titulo, items, onOpen, onDelete, dimmed }: {
  titulo: string;
  items: Licitacion[];
  onOpen: (id: string) => void;
  onDelete: (l: Licitacion) => void;
  dimmed?: boolean;
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{titulo}</h2>
      <div className="rounded-lg border divide-y overflow-hidden">
        {items.map(l => (
          <LicitacionRow key={l.id} licitacion={l} onOpen={onOpen} onDelete={onDelete} dimmed={dimmed} />
        ))}
      </div>
    </div>
  );
}

// ─── Fila ──────────────────────────────────────────────────────────────────────

function LicitacionRow({ licitacion: l, onOpen, onDelete, dimmed }: {
  licitacion: Licitacion;
  onOpen: (id: string) => void;
  onDelete: (l: Licitacion) => void;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors ${dimmed ? 'opacity-60' : ''}`}
      onClick={() => onOpen(l.id)}
    >
      {/* Estado */}
      <Badge className={`shrink-0 text-xs ${LICITACION_ESTADO_COLORS[l.estado]}`}>
        {LICITACION_ESTADO_LABELS[l.estado]}
      </Badge>

      {/* Info principal */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{l.nombre}</p>
        <p className="text-xs text-muted-foreground truncate">
          {l.entidad && <span>{l.entidad}</span>}
          {l.entidad && l.numero_sicoes && <span className="mx-1.5">·</span>}
          {l.numero_sicoes && <span className="font-mono">{l.numero_sicoes}</span>}
          {!l.entidad && !l.numero_sicoes && <span className="italic">Sin entidad registrada</span>}
        </p>
      </div>

      {/* Tipo proceso */}
      <span className="hidden sm:block text-xs text-muted-foreground shrink-0">
        {TIPO_PROCESO_LABELS[l.tipo_proceso]}
      </span>

      {/* Precio referencial */}
      {l.precio_referencial != null && (
        <span className="hidden md:block text-sm font-mono shrink-0">
          Bs {fmt(l.precio_referencial)}
        </span>
      )}

      {/* Fecha presentación */}
      {l.fecha_presentacion && (
        <span className="hidden lg:block text-xs text-muted-foreground shrink-0">
          {new Date(l.fecha_presentacion + 'T12:00:00').toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      )}

      {/* Acciones */}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={e => { e.stopPropagation(); onDelete(l); }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </div>
  );
}

// ─── Estado vacío ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <h3 className="font-semibold text-lg mb-1">No hay licitaciones todavía</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Crea tu primera licitación para empezar a registrar cotizaciones y documentos.
      </p>
      <Button onClick={onNew} className="gap-2">
        <Plus className="h-4 w-4" />
        Nueva Licitación
      </Button>
    </div>
  );
}
