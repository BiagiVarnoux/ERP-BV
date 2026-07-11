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
import { Plus, Search, Trash2, ChevronRight, FileText, Clock, AlertTriangle, CalendarClock, ListChecks, X, Layers } from 'lucide-react';
import { Licitacion, LicitacionEstado, LICITACION_ESTADO_LABELS, LICITACION_ESTADO_COLORS, TIPO_PROCESO_LABELS } from '@/accounting/licitacion-types';
import { fmt } from '@/accounting/utils';
import { NuevaLicitacionModal } from './NuevaLicitacionModal';
import { LicitacionesConsolidado } from './LicitacionesConsolidado';

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
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConsolidado, setShowConsolidado] = useState(false);

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={toggleSelectMode} className="gap-2">
            {selectMode ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
            {selectMode ? 'Cancelar selección' : 'Seleccionar'}
          </Button>
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Licitación
          </Button>
        </div>
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
            <Section
              titulo="Activas" items={activas} onOpen={onOpen} onDelete={setDeleteTarget}
              selectMode={selectMode} selectedIds={selectedIds} onToggleSelected={toggleSelected}
            />
          )}
          {/* Cerradas */}
          {cerradas.length > 0 && (
            <Section
              titulo="Historial" items={cerradas} onOpen={onOpen} onDelete={setDeleteTarget} dimmed
              selectMode={selectMode} selectedIds={selectedIds} onToggleSelected={toggleSelected}
            />
          )}
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Sin resultados para la búsqueda.</p>
          )}
        </div>
      )}

      {/* Barra flotante de selección */}
      {selectMode && selectedIds.size >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border bg-background shadow-lg px-4 py-2.5">
          <span className="text-sm font-medium">{selectedIds.size} seleccionadas</span>
          <Button size="sm" className="gap-2" onClick={() => setShowConsolidado(true)}>
            <Layers className="h-3.5 w-3.5" />
            Ver consolidado
          </Button>
        </div>
      )}

      {showConsolidado && (
        <LicitacionesConsolidado
          ids={Array.from(selectedIds)}
          onClose={() => setShowConsolidado(false)}
        />
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

function Section({ titulo, items, onOpen, onDelete, dimmed, selectMode, selectedIds, onToggleSelected }: {
  titulo: string;
  items: Licitacion[];
  onOpen: (id: string) => void;
  onDelete: (l: Licitacion) => void;
  dimmed?: boolean;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelected: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{titulo}</h2>
      <div className="rounded-lg border divide-y overflow-hidden">
        {items.map(l => (
          <LicitacionRow
            key={l.id} licitacion={l} onOpen={onOpen} onDelete={onDelete} dimmed={dimmed}
            selectMode={selectMode} selected={selectedIds.has(l.id)} onToggleSelected={onToggleSelected}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Fila ──────────────────────────────────────────────────────────────────────

function LicitacionRow({ licitacion: l, onOpen, onDelete, dimmed, selectMode, selected, onToggleSelected }: {
  licitacion: Licitacion;
  onOpen: (id: string) => void;
  onDelete: (l: Licitacion) => void;
  dimmed?: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelected: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors ${dimmed ? 'opacity-60' : ''} ${selected ? 'bg-primary/5' : ''}`}
      onClick={() => selectMode ? onToggleSelected(l.id) : onOpen(l.id)}
    >
      {selectMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(l.id)}
          onClick={e => e.stopPropagation()}
          className="shrink-0 h-4 w-4 rounded"
        />
      )}

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

      {/* Cuenta regresiva */}
      <CountdownChip licitacion={l} />

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

// ─── Chip de cuenta regresiva ──────────────────────────────────────────────────

/** Calcula días entre hoy (medianoche) y una fecha ISO YYYY-MM-DD. Negativo = vencido.
 *  Usa timezone Bolivia (UTC-4) explícita para evitar desfases si el cliente está en otra zona. */
function diasHasta(fechaIso: string): number {
  const hoy   = new Date(); hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaIso + 'T12:00:00-04:00'); // mediodía Bolivia, siempre UTC-4
  return Math.round((fecha.getTime() - hoy.getTime()) / 86_400_000);
}

function CountdownChip({ licitacion: l }: { licitacion: Licitacion }) {
  // Determinar qué fecha y etiqueta mostrar según el estado
  let fechaIso: string | undefined;
  let etiqueta: string;
  let icono: 'clock' | 'alert' | 'calendar' = 'calendar';

  if (l.estado === 'BORRADOR' || l.estado === 'PRESENTADA') {
    fechaIso = l.fecha_presentacion;
    etiqueta = 'para presentar';
    icono    = 'clock';
  } else if (l.estado === 'ADJUDICADA') {
    // Prioridad: fecha_limite_entrega > fecha_contrato + plazo > fecha_contrato
    if (l.fecha_limite_entrega) {
      fechaIso = l.fecha_limite_entrega;
      etiqueta = 'para entregar';
      icono    = 'alert';
    } else if (l.fecha_contrato && l.plazo_entrega_dias) {
      // Calcular fecha límite desde el contrato + plazo
      const d = new Date(l.fecha_contrato + 'T12:00:00');
      d.setDate(d.getDate() + l.plazo_entrega_dias);
      fechaIso = d.toISOString().slice(0, 10);
      etiqueta = 'para entregar';
      icono    = 'alert';
    } else if (l.fecha_contrato) {
      fechaIso = l.fecha_contrato;
      etiqueta = 'para firma contrato';
      icono    = 'calendar';
    }
  }

  if (!fechaIso) return null;

  const dias = diasHasta(fechaIso);

  // Colores y texto según urgencia
  let chip: { bg: string; text: string; label: string };
  if (dias < 0) {
    chip = {
      bg:    'bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800',
      text:  'text-red-700 dark:text-red-400',
      label: `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`,
    };
  } else if (dias === 0) {
    chip = {
      bg:    'bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800',
      text:  'text-red-700 dark:text-red-400',
      label: `¡Hoy! ${etiqueta}`,
    };
  } else if (dias <= 2) {
    chip = {
      bg:    'bg-orange-100 dark:bg-orange-950/60 border border-orange-300 dark:border-orange-800',
      text:  'text-orange-700 dark:text-orange-400',
      label: `${dias} día${dias !== 1 ? 's' : ''} ${etiqueta}`,
    };
  } else if (dias <= 7) {
    chip = {
      bg:    'bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800',
      text:  'text-amber-700 dark:text-amber-400',
      label: `${dias} días ${etiqueta}`,
    };
  } else {
    chip = {
      bg:    'bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800',
      text:  'text-blue-600 dark:text-blue-400',
      label: `${dias} días ${etiqueta}`,
    };
  }

  const Icon = icono === 'alert' ? AlertTriangle : icono === 'clock' ? Clock : CalendarClock;

  return (
    <span className={`hidden sm:inline-flex items-center gap-1 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${chip.bg} ${chip.text}`}>
      <Icon className="h-3 w-3" />
      {chip.label}
    </span>
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
