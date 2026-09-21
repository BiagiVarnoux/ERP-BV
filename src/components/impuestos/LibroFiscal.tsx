import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DataCard, DataCardHeader, DataCardGrid, DataCardField, DataCardActions, DataCardList,
} from '@/components/ui/data-card';
import {
  Plus, Download, Loader2, FileDown, Receipt, Ban, Pencil, Trash2, ArrowDownToLine,
  Paperclip,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUserAccess, useActiveCompanyId } from '@/contexts/UserAccessContext';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { fmt, nowInAppTZ } from '@/accounting/utils';
import { generateCSV, downloadCSV } from '@/services/exportService';
import { TaxDocumentModal } from './TaxDocumentModal';
import { ImportarDialog } from './ImportarDialog';
import {
  TIPO_DOCUMENTO_LABEL, anularTaxDocument, deleteTaxDocument, descargarArchivoFactura,
  formatPeriodo, listTaxDocuments, periodosRecientes, totalesLibro, urlFirmadaFactura,
  type TaxDocTipo, type TaxDocumentRow,
} from '@/domain/taxes';
import { downloadBlob, openExternalUrl } from '@/lib/open-url';

function periodoActualDefault(): string {
  const { year, month } = nowInAppTZ();
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function LibroFiscal({ tipo }: { tipo: TaxDocTipo }) {
  const esCompra = tipo === 'compra';
  const companyId = useActiveCompanyId();
  const { can } = useUserAccess();
  const canCreate = can('taxes', 'create');
  const canEdit   = can('taxes', 'edit');
  const canDelete = can('taxes', 'delete');
  const canExport = can('taxes', 'export');

  const [periodo, setPeriodo]   = useState(periodoActualDefault);
  const [rows, setRows]         = useState<TaxDocumentRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');

  const [showForm, setShowForm]     = useState(false);
  const [editRow, setEditRow]       = useState<TaxDocumentRow | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [anularTarget, setAnularTarget]   = useState<TaxDocumentRow | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<TaxDocumentRow | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setRows(await listTaxDocuments(companyId, tipo, periodo));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error cargando el libro');
    } finally {
      setLoading(false);
    }
  }, [companyId, tipo, periodo]);

  useEffect(() => { load(); }, [load]);

  const periodos = useMemo(() => periodosRecientes(periodoActualDefault(), 24), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.razon_social.toLowerCase().includes(q) ||
      (r.nit ?? '').toLowerCase().includes(q) ||
      (r.numero_factura ?? '').toLowerCase().includes(q) ||
      (r.numero_autorizacion ?? '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totales = useMemo(() => totalesLibro(rows), [rows]);

  /** Abre la factura adjunta en una pestaña con una URL firmada temporal. */
  async function verAdjunto(row: TaxDocumentRow) {
    if (!row.archivo_path) return;
    try {
      openExternalUrl(await urlFirmadaFactura(row.archivo_path));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir el archivo');
    }
  }

  /** Descarga el adjunto conservando el nombre original del archivo. */
  async function descargarAdjunto(row: TaxDocumentRow) {
    if (!row.archivo_path) return;
    try {
      const blob = await descargarArchivoFactura(row.archivo_path);
      downloadBlob(blob, row.archivo_nombre ?? `factura-${row.numero_factura ?? row.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descargar el archivo');
    }
  }

  function abrirNuevo() { setEditRow(null); setShowForm(true); }
  function abrirEditar(row: TaxDocumentRow) { setEditRow(row); setShowForm(true); }

  async function confirmarAnular() {
    if (!anularTarget || !companyId) return;
    try {
      await anularTaxDocument(anularTarget.id, companyId, anularTarget.notas ?? undefined);
      toast.success('Documento anulado: deja de computar en el libro');
      setAnularTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo anular');
    }
  }

  async function confirmarEliminar() {
    if (!deleteTarget || !companyId) return;
    try {
      await deleteTaxDocument(deleteTarget.id, companyId);
      toast.success('Documento eliminado del libro');
      setDeleteTarget(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  }

  function exportar() {
    const csv = generateCSV<TaxDocumentRow>([
      { header: 'Fecha',            accessor: 'fecha' },
      { header: 'Período',          accessor: 'periodo' },
      { header: 'NIT',              accessor: r => r.nit ?? '' },
      { header: esCompra ? 'Proveedor' : 'Cliente', accessor: 'razon_social' },
      { header: 'Tipo documento',   accessor: r => TIPO_DOCUMENTO_LABEL[r.tipo_documento] },
      { header: 'Nº Factura',       accessor: r => r.numero_factura ?? '' },
      { header: 'Nº Autorización',  accessor: r => r.numero_autorizacion ?? '' },
      { header: 'Código de control', accessor: r => r.codigo_control ?? '' },
      { header: 'Importe total',    accessor: r => r.importe_total },
      { header: 'ICE/IEHD',         accessor: r => r.importe_ice },
      { header: 'Exento',           accessor: r => r.importe_exento },
      { header: 'Descuentos',       accessor: r => r.descuentos },
      { header: 'Base imponible',   accessor: r => r.base_imponible },
      { header: esCompra ? 'Crédito fiscal' : 'Débito fiscal', accessor: r => r.iva },
      { header: 'Estado',           accessor: 'estado' },
      { header: 'Archivo adjunto',  accessor: r => r.archivo_nombre ?? '' },
      ...(esCompra ? [{ header: 'Con derecho a crédito', accessor: (r: TaxDocumentRow) => (r.con_derecho_credito ? 'SI' : 'NO') }] : []),
    ], filtered);
    downloadCSV(csv, `libro-${esCompra ? 'compras' : 'ventas'}-${periodo}.csv`);
  }

  const titulo   = esCompra ? 'Libro de Compras IVA' : 'Libro de Ventas IVA';
  const ivaLabel = esCompra ? 'Crédito fiscal' : 'Débito fiscal';

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Receipt className="w-6 h-6" /> {titulo}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {esCompra
              ? 'Facturas de compra que sustentan el crédito fiscal del período.'
              : 'Facturas emitidas que generan el débito fiscal del período.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport && filtered.length > 0 && (
            <Button variant="outline" onClick={exportar}>
              <Download className="w-4 h-4 mr-2" /> Exportar CSV
            </Button>
          )}
          {canCreate && (
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <ArrowDownToLine className="w-4 h-4 mr-2" />
              {esCompra ? 'Importar desde CxP' : 'Importar desde Ventas'}
            </Button>
          )}
          {canCreate && (
            <Button onClick={abrirNuevo}>
              <Plus className="w-4 h-4 mr-2" /> Nueva factura
            </Button>
          )}
        </div>
      </div>

      {/* Totales del período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="text-sm text-muted-foreground">Documentos</div>
          <div className="text-xl sm:text-2xl font-bold">{totales.documentos}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="text-sm text-muted-foreground">Importe facturado</div>
          <div className="text-xl sm:text-2xl font-bold">Bs {fmt(totales.importe_total)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="text-sm text-muted-foreground">Base imponible</div>
          <div className="text-xl sm:text-2xl font-bold">Bs {fmt(totales.base_imponible)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <div className="text-sm text-muted-foreground">{ivaLabel}</div>
          <div className={`text-xl sm:text-2xl font-bold ${esCompra ? 'text-green-600' : 'text-blue-600'}`}>
            Bs {fmt(totales.iva)}
          </div>
          {esCompra && totales.iva_sin_derecho > 0 && (
            <div className="text-xs text-amber-600">
              + Bs {fmt(totales.iva_sin_derecho)} sin derecho a crédito
            </div>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {periodos.map(p => <SelectItem key={p} value={p}>{formatPeriodo(p)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          className="w-full sm:max-w-xs"
          placeholder="Buscar por NIT, razón social o Nº de factura..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Listado */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center px-4">
          <FileDown className="w-12 h-12 mb-4 opacity-40" />
          <p>No hay documentos registrados en {formatPeriodo(periodo)}.</p>
          {canCreate && (
            <p className="text-sm mt-1">
              {esCompra
                ? 'Carga las facturas a mano o impórtalas desde Cuentas por Pagar.'
                : 'Impórtalas desde las ventas con factura del período.'}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Móvil */}
          <DataCardList>
            {filtered.map(row => (
              <DataCard key={row.id} className={row.estado === 'anulada' ? 'opacity-60' : ''}>
                <DataCardHeader
                  title={<span className="font-mono text-sm">{row.numero_factura ?? 'S/N'}</span>}
                  subtitle={row.razon_social}
                  right={
                    row.estado === 'anulada'
                      ? <Badge variant="outline" className="text-xs text-muted-foreground">Anulada</Badge>
                      : esCompra && !row.con_derecho_credito
                        ? <Badge className="bg-amber-500 hover:bg-amber-600 text-xs">Sin crédito</Badge>
                        : <Badge variant="outline" className="text-xs">{TIPO_DOCUMENTO_LABEL[row.tipo_documento]}</Badge>
                  }
                />
                <DataCardGrid className="mt-3">
                  <DataCardField label="Fecha">{row.fecha}</DataCardField>
                  <DataCardField label="NIT"><span className="font-mono">{row.nit ?? '—'}</span></DataCardField>
                  <DataCardField label="Importe">{fmt(row.importe_total)}</DataCardField>
                  <DataCardField label={ivaLabel}><span className="font-semibold">{fmt(row.iva)}</span></DataCardField>
                </DataCardGrid>
                {row.archivo_path && (
                  <DataCardActions className="mt-2 pt-2 border-t">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => verAdjunto(row)}>
                      <Paperclip className="w-3.5 h-3.5 mr-1.5" /> Ver factura
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => descargarAdjunto(row)}>
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Descargar
                    </Button>
                  </DataCardActions>
                )}
                {(canEdit || canDelete) && row.estado === 'vigente' && (
                  <DataCardActions className="mt-2 pt-2 border-t">
                    {canEdit && <Button size="sm" variant="outline" className="flex-1" onClick={() => abrirEditar(row)}>Editar</Button>}
                    {canEdit && <Button size="sm" variant="outline" className="flex-1" onClick={() => setAnularTarget(row)}>Anular</Button>}
                  </DataCardActions>
                )}
              </DataCard>
            ))}
          </DataCardList>

          {/* Escritorio */}
          <div className="rounded-md border hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>NIT</TableHead>
                  <TableHead>{esCompra ? 'Proveedor' : 'Cliente'}</TableHead>
                  <TableHead>Nº Factura</TableHead>
                  <TableHead>Autorización</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">{ivaLabel}</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Factura</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(row => (
                  <TableRow key={row.id} className={row.estado === 'anulada' ? 'opacity-60' : ''}>
                    <TableCell className="whitespace-nowrap">{row.fecha}</TableCell>
                    <TableCell className="font-mono text-xs">{row.nit ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={row.razon_social}>{row.razon_social}</TableCell>
                    <TableCell className="font-mono text-xs">{row.numero_factura ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[140px] truncate" title={row.numero_autorizacion ?? ''}>
                      {row.numero_autorizacion ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(row.importe_total)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(row.base_imponible)}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{fmt(row.iva)}</TableCell>
                    <TableCell className="text-center">
                      {row.estado === 'anulada'
                        ? <Badge variant="outline" className="text-xs text-muted-foreground">Anulada</Badge>
                        : esCompra && !row.con_derecho_credito
                          ? <Badge className="bg-amber-500 hover:bg-amber-600 text-xs">Sin crédito</Badge>
                          : <Badge variant="outline" className="text-xs">{TIPO_DOCUMENTO_LABEL[row.tipo_documento]}</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.archivo_path ? (
                        <div className="flex items-center justify-center">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title={`Ver ${row.archivo_nombre ?? 'la factura'}`}
                            onClick={() => verAdjunto(row)}
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title="Descargar" onClick={() => descargarAdjunto(row)}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {canEdit && row.estado === 'vigente' && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => abrirEditar(row)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Anular" onClick={() => setAnularTarget(row)}>
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Eliminar" onClick={() => setDeleteTarget(row)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {companyId && (
        <>
          <TaxDocumentModal
            open={showForm}
            onOpenChange={setShowForm}
            tipo={tipo}
            companyId={companyId}
            editRow={editRow}
            periodoActual={periodo}
            onSaved={load}
          />
          <ImportarDialog
            open={showImport}
            onOpenChange={setShowImport}
            tipo={tipo}
            companyId={companyId}
            periodo={periodo}
            onImported={load}
          />
        </>
      )}

      <AlertDialog open={!!anularTarget} onOpenChange={o => !o && setAnularTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular este documento fiscal?</AlertDialogTitle>
            <AlertDialogDescription>
              La factura queda registrada en el libro con el rastro de la anulación, pero deja de
              computar en el {ivaLabel.toLowerCase()} del período. No modifica el asiento contable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAnular}>Anular</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar del libro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra la fila del libro fiscal sin dejar rastro en el período, junto con el archivo
              de la factura si lo tenía adjunto. Si la factura existió y fue anulada, usa «Anular»
              en lugar de eliminar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarEliminar} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
