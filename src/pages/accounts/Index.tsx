// src/pages/accounts/Index.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Save, Banknote, Calendar, Tag, BarChart3, TrendingUp, Settings2, FileDown, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { AccountsBulkUploadModal } from '@/components/accounts/AccountsBulkUploadModal';
import { exportChartOfAccountsToPDF } from '@/services/pdfService';
import { downloadCSV } from '@/services/exportService';
import {
  Account, ACCOUNT_TYPES, SIDES,
  CLASIFICACION_RESULTADO, ClasificacionResultado, CLASIFICACION_RESULTADO_LABELS,
  CLASIFICACION_FLUJO, ClasificacionFlujo, CLASIFICACION_FLUJO_LABELS,
  SUBCLASIFICACION_RESULTADO, SUBCLASIFICACION_RESULTADO_LABELS,
} from '@/accounting/types';

// Which clasificacion_resultado options are valid per account type
const CLASIFICACION_POR_TIPO: Record<string, ClasificacionResultado[]> = {
  INGRESO: ['ingreso_operativo', 'ingreso_no_operativo'],
  GASTO: ['costo_ventas', 'gasto_operativo', 'gasto_no_operativo', 'impuesto'],
};

// Which subclasificacion options are valid per clasificacion
const SUB_POR_CLASIFICACION: Record<string, string[]> = {
  ingreso_operativo: ['ventas', 'devoluciones', 'otros_ingresos_operativos'],
  ingreso_no_operativo: ['intereses', 'diferencial_cambiario', 'otro'],
  costo_ventas: ['costo_mercaderia', 'costo_produccion', 'costo_servicios', 'otro'],
  gasto_operativo: ['administrativos', 'ventas_marketing', 'logistica', 'depreciacion', 'amortizacion', 'otro'],
  gasto_no_operativo: ['intereses', 'comisiones_bancarias', 'diferencial_cambiario', 'otro'],
  impuesto: ['otro'],
};

function getDefaultDraft(): Partial<Account> {
  return {
    type: "ACTIVO",
    normal_side: "DEBE",
    is_active: true,
    is_cash_equivalent: false,
    is_current: null,
    clasificacion_resultado: null,
    subclasificacion_resultado: null,
    clasificacion_flujo: 'no_aplica',
    es_partida_no_monetaria: false,
    es_capital_trabajo: false,
    es_financiera: false,
    es_extraordinaria: false,
    afecta_ebitda: true,
  };
}

export default function AccountsPage() {
  const { accounts, entries, setAccounts, adapter } = useAccounting();
  const { can } = useUserAccess();
  const canCreate  = can('accounts', 'create');
  const canEdit    = can('accounts', 'edit');
  const canDelete  = can('accounts', 'delete');
  const isReadOnly = !canCreate && !canEdit && !canDelete;
  const [accDraft, setAccDraft] = useState<Partial<Account>>(getDefaultDraft());
  const [editingAccId, setEditingAccId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  function exportAccountsToCSV() {
    const headers = ['codigo','nombre','tipo','lado_normal','activa','clasificacion_resultado','subclasificacion_resultado','clasificacion_flujo','es_efectivo','es_corriente','es_partida_no_monetaria','es_capital_trabajo','es_financiera','es_extraordinaria','afecta_ebitda'];
    const rows = accounts.map(a => [
      a.id, a.name, a.type, a.normal_side, String(a.is_active),
      a.clasificacion_resultado || '', a.subclasificacion_resultado || '', a.clasificacion_flujo || '',
      String(!!a.is_cash_equivalent), a.is_current === null ? '' : String(a.is_current),
      String(!!a.es_partida_no_monetaria), String(!!a.es_capital_trabajo),
      String(!!a.es_financiera), String(!!a.es_extraordinaria), String(a.afecta_ebitda !== false),
    ]);
    const csv = [headers, ...rows].map(r => r.map(x => `"${(x ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadCSV(csv, 'plan_de_cuentas.csv');
  }

  async function handleBulkImport(importedAccounts: Account[]) {
    for (const acc of importedAccounts) {
      await adapter.upsertAccount(acc);
    }
    setAccounts(await adapter.loadAccounts());
  }

  async function upsertAccount() {
    if (isReadOnly) { toast.error("No tienes permisos para modificar cuentas"); return; }
    const d = accDraft as Account;
    if (!d.id || !d.name || !d.type || !d.normal_side) {
      toast.error("Completa código, nombre, tipo y lado"); return;
    }
    if (!ACCOUNT_TYPES.includes(d.type)) { toast.error("Tipo inválido"); return; }
    if (!SIDES.includes(d.normal_side)) { toast.error("Lado inválido"); return; }
    try {
      await adapter.upsertAccount(d);
      setAccounts(await adapter.loadAccounts());
      toast.success(editingAccId ? "Cuenta actualizada" : "Cuenta creada");
      setAccDraft(getDefaultDraft());
      setEditingAccId(null);
    } catch(e: any) {
      toast.error(e.message || "Error guardando cuenta");
    }
  }

  function editAccount(a: Account) {
    if (isReadOnly) return;
    setAccDraft({
      ...a,
      clasificacion_resultado: a.clasificacion_resultado ?? null,
      subclasificacion_resultado: a.subclasificacion_resultado ?? null,
      clasificacion_flujo: a.clasificacion_flujo ?? 'no_aplica',
      es_partida_no_monetaria: a.es_partida_no_monetaria ?? false,
      es_capital_trabajo: a.es_capital_trabajo ?? false,
      es_financiera: a.es_financiera ?? false,
      es_extraordinaria: a.es_extraordinaria ?? false,
      afecta_ebitda: a.afecta_ebitda ?? true,
    });
    setEditingAccId(a.id);
    setShowAdvanced(true);
  }

  async function deleteAccount(id: string) {
    if (isReadOnly) { toast.error("No tienes permisos para eliminar cuentas"); return; }
    try {
      await adapter.deleteAccount(id);
      setAccounts(await adapter.loadAccounts());
      toast.success("Cuenta eliminada");
    } catch(e: any) {
      toast.error(e.message || "No se pudo eliminar");
    }
  }

  function canDeleteAccount(id: string) {
    return !entries.some(e => e.lines.some(l => l.account_id === id));
  }

  async function toggleAccountStatus(account: Account) {
    if (isReadOnly) { toast.error("No tienes permisos para modificar cuentas"); return; }
    const updated = { ...account, is_active: !account.is_active };
    try {
      await adapter.upsertAccount(updated);
      setAccounts(await adapter.loadAccounts());
      toast.success(`Cuenta ${updated.is_active ? 'activada' : 'desactivada'}`);
    } catch(e: any) {
      toast.error(e.message || "Error actualizando cuenta");
    }
  }

  const showClasResultado = accDraft.type === 'INGRESO' || accDraft.type === 'GASTO';
  const showClasFlujoBal = accDraft.type === 'ACTIVO' || accDraft.type === 'PASIVO' || accDraft.type === 'PATRIMONIO';
  const availableClasResultado = CLASIFICACION_POR_TIPO[accDraft.type || ''] || [];
  const availableSub = SUB_POR_CLASIFICACION[accDraft.clasificacion_resultado || ''] || [];

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Plan de Cuentas</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportChartOfAccountsToPDF(accounts)}>
              <FileDown className="w-4 h-4 mr-1" />PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportAccountsToCSV}>
              <FileDown className="w-4 h-4 mr-1" />CSV
            </Button>
            {!isReadOnly && (
              <Button variant="outline" size="sm" onClick={() => setShowBulkUpload(true)}>
                <Upload className="w-4 h-4 mr-1" />Carga Masiva
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isReadOnly && (
            <>
              {/* Row 1: Basic fields */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-1">
                  <Label>Código</Label>
                  <Input value={accDraft.id || ""} onChange={e => setAccDraft(p => ({...p, id: e.target.value}))} placeholder="A.1" />
                </div>
                <div className="md:col-span-2">
                  <Label>Nombre</Label>
                  <Input value={accDraft.name || ""} onChange={e => setAccDraft(p => ({...p, name: e.target.value}))} placeholder="Caja MN" />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={accDraft.type as string}
                    onValueChange={(v) => setAccDraft(p => ({
                      ...p,
                      type: v as any,
                      is_cash_equivalent: v === 'ACTIVO' ? (p.is_cash_equivalent ?? false) : false,
                      is_current: (v === 'ACTIVO' || v === 'PASIVO') ? p.is_current : null,
                      clasificacion_resultado: null,
                      subclasificacion_resultado: null,
                      clasificacion_flujo: (v === 'INGRESO' || v === 'GASTO') ? 'no_aplica' : (p.clasificacion_flujo ?? 'no_aplica'),
                    }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lado normal</Label>
                  <Select value={accDraft.normal_side as string} onValueChange={(v) => setAccDraft(p => ({...p, normal_side: v as any}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SIDES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <div className="flex items-center gap-2">
                    <Checkbox id="is_active" checked={!!accDraft.is_active} onCheckedChange={(checked) => setAccDraft(p => ({...p, is_active: !!checked}))} />
                    <Label htmlFor="is_active">Activa</Label>
                  </div>
                </div>
              </div>

              {/* Row 2: Classification fields */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-muted">
                {/* Clasificación para Estado de Resultados */}
                {showClasResultado && (
                  <div>
                    <Label className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />Clasificación Resultado</Label>
                    <Select
                      value={accDraft.clasificacion_resultado || "_none"}
                      onValueChange={(v) => setAccDraft(p => ({
                        ...p,
                        clasificacion_resultado: v === '_none' ? null : v as ClasificacionResultado,
                        subclasificacion_resultado: null,
                      }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Sin clasificar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Sin clasificar</SelectItem>
                        {availableClasResultado.map(c => <SelectItem key={c} value={c}>{CLASIFICACION_RESULTADO_LABELS[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Subclasificación */}
                {showClasResultado && accDraft.clasificacion_resultado && availableSub.length > 0 && (
                  <div>
                    <Label className="flex items-center gap-1"><Tag className="h-3 w-3" />Subclasificación</Label>
                    <Select
                      value={(accDraft.subclasificacion_resultado as string) || "_none"}
                      onValueChange={(v) => setAccDraft(p => ({...p, subclasificacion_resultado: v === '_none' ? null : v}))}
                    >
                      <SelectTrigger><SelectValue placeholder="Sin especificar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Sin especificar</SelectItem>
                        {availableSub.map(s => (
                          <SelectItem key={s} value={s}>
                            {(SUBCLASIFICACION_RESULTADO_LABELS as any)[s] || s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Current/Non-Current */}
                {(accDraft.type === 'ACTIVO' || accDraft.type === 'PASIVO') && (
                  <div>
                    <Label className="flex items-center gap-1"><Calendar className="h-3 w-3" />Corriente / No Corriente</Label>
                    <Select
                      value={accDraft.is_current === true ? 'current' : accDraft.is_current === false ? 'non_current' : '_auto'}
                      onValueChange={(v) => setAccDraft(p => ({...p, is_current: v === 'current' ? true : v === 'non_current' ? false : null}))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_auto">Automático</SelectItem>
                        <SelectItem value="current">Corriente</SelectItem>
                        <SelectItem value="non_current">No Corriente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Clasificación de Flujo */}
                {showClasFlujoBal && (
                  <div>
                    <Label className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />Clasificación Flujo</Label>
                    <Select
                      value={accDraft.clasificacion_flujo || 'no_aplica'}
                      onValueChange={(v) => setAccDraft(p => ({...p, clasificacion_flujo: v as ClasificacionFlujo}))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CLASIFICACION_FLUJO.map(c => <SelectItem key={c} value={c}>{CLASIFICACION_FLUJO_LABELS[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Cash Equivalent */}
                {accDraft.type === 'ACTIVO' && (
                  <div className="flex items-end">
                    <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md">
                      <Checkbox id="is_cash_equivalent" checked={!!accDraft.is_cash_equivalent} onCheckedChange={(checked) => setAccDraft(p => ({...p, is_cash_equivalent: !!checked}))} />
                      <Label htmlFor="is_cash_equivalent" className="flex items-center gap-1 text-sm cursor-pointer">
                        <Banknote className="h-3 w-3" />Es efectivo o equivalente
                      </Label>
                    </div>
                  </div>
                )}
              </div>

              {/* Row 3: Advanced financial properties (collapsible) */}
              <div className="pt-2 border-t border-muted">
                <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs text-muted-foreground">
                  <Settings2 className="h-3 w-3 mr-1" />
                  {showAdvanced ? 'Ocultar' : 'Mostrar'} propiedades financieras avanzadas
                </Button>
                {showAdvanced && (
                  <div className="flex flex-wrap gap-4 mt-2 p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Checkbox id="es_partida_no_monetaria" checked={!!accDraft.es_partida_no_monetaria} onCheckedChange={(c) => setAccDraft(p => ({...p, es_partida_no_monetaria: !!c}))} />
                      <Label htmlFor="es_partida_no_monetaria" className="text-sm cursor-pointer">Partida no monetaria</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="es_capital_trabajo" checked={!!accDraft.es_capital_trabajo} onCheckedChange={(c) => setAccDraft(p => ({...p, es_capital_trabajo: !!c}))} />
                      <Label htmlFor="es_capital_trabajo" className="text-sm cursor-pointer">Capital de trabajo</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="es_financiera" checked={!!accDraft.es_financiera} onCheckedChange={(c) => setAccDraft(p => ({...p, es_financiera: !!c}))} />
                      <Label htmlFor="es_financiera" className="text-sm cursor-pointer">Financiera</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="es_extraordinaria" checked={!!accDraft.es_extraordinaria} onCheckedChange={(c) => setAccDraft(p => ({...p, es_extraordinaria: !!c}))} />
                      <Label htmlFor="es_extraordinaria" className="text-sm cursor-pointer">Extraordinaria</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="afecta_ebitda" checked={accDraft.afecta_ebitda !== false} onCheckedChange={(c) => setAccDraft(p => ({...p, afecta_ebitda: !!c}))} />
                      <Label htmlFor="afecta_ebitda" className="text-sm cursor-pointer">Afecta EBITDA</Label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={upsertAccount}>
                  <Save className="w-4 h-4 mr-2" />
                  {editingAccId ? "Guardar cambios" : "Agregar cuenta"}
                </Button>
                {editingAccId && (
                  <Button variant="outline" onClick={() => { setAccDraft(getDefaultDraft()); setEditingAccId(null); }}>
                    Cancelar
                  </Button>
                )}
              </div>
            </>
          )}

          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Lado</TableHead>
                  <TableHead>Clasificación</TableHead>
                  <TableHead>Estado</TableHead>
                  {!isReadOnly && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono">{a.id}</TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{a.type}</TableCell>
                    <TableCell>{a.normal_side}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {a.clasificacion_resultado && (
                          <Badge variant="outline" className="text-xs">
                            {CLASIFICACION_RESULTADO_LABELS[a.clasificacion_resultado]}
                          </Badge>
                        )}
                        {a.subclasificacion_resultado && (
                          <Badge variant="secondary" className="text-xs">
                            {(SUBCLASIFICACION_RESULTADO_LABELS as any)[a.subclasificacion_resultado] || a.subclasificacion_resultado}
                          </Badge>
                        )}
                        {(a.type === 'ACTIVO' || a.type === 'PASIVO') && a.is_current !== null && a.is_current !== undefined && (
                          <Badge variant="outline" className="text-xs">
                            {a.is_current ? 'Corriente' : 'No Corriente'}
                          </Badge>
                        )}
                        {a.clasificacion_flujo && a.clasificacion_flujo !== 'no_aplica' && (
                          <Badge variant="outline" className="text-xs">
                            Flujo: {CLASIFICACION_FLUJO_LABELS[a.clasificacion_flujo]}
                          </Badge>
                        )}
                        {a.is_cash_equivalent && (
                          <Badge className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-0">
                            Efectivo
                          </Badge>
                        )}
                        {a.es_partida_no_monetaria && <Badge variant="secondary" className="text-xs">No monetaria</Badge>}
                        {a.es_capital_trabajo && <Badge variant="secondary" className="text-xs">Cap. trabajo</Badge>}
                        {a.es_financiera && <Badge variant="secondary" className="text-xs">Financiera</Badge>}
                        {a.es_extraordinaria && <Badge variant="secondary" className="text-xs">Extraordinaria</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{a.is_active ? "Activa" : "Inactiva"}</TableCell>
                    {!isReadOnly && (
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => editAccount(a)} title="Editar"><Pencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleAccountStatus(a)}>{a.is_active ? "Desactivar" : "Activar"}</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteAccount(a.id)} disabled={!canDeleteAccount(a.id)} title="Eliminar"><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AccountsBulkUploadModal
        isOpen={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onImport={handleBulkImport}
        existingAccounts={accounts}
      />
    </div>
  );
}
