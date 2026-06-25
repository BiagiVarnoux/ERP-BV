// Pestaña de configuración: mapeo tipo_pago → cuenta contable por empresa.
// Muestra los 12 métodos de pago con un selector de cuenta (solo cuentas ACTIVO).
// Los defaults del código se muestran como placeholder si la empresa no tiene config.

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import {
  loadSaleAccountConfig,
  saveSaleAccountConfig,
  DEFAULT_PAYMENT_ACCOUNTS,
  TIPO_PAGO_LABELS,
  type SaleAccountConfig,
  type TipoPago,
} from '@/domain/sales';

// Todos los tipos de pago en el orden que se muestran al usuario
const ALL_TIPOS_PAGO: TipoPago[] = [
  'caja_mn',
  'banco_mn',
  'banco_me',
  'facebank',
  'facebank2',
  'facebank3',
  'usdt',
  'usdt2',
  'cxc',
  'cxc_electronica',
  'cxc_pedido',
  'cxc_licitaciones',
];

const CXC_TIPOS: TipoPago[] = ['cxc', 'cxc_electronica', 'cxc_pedido', 'cxc_licitaciones'];

export function SaleAccountsConfigTab() {
  const companyId = useActiveCompanyId();
  const { accounts } = useAccounting();
  const [config, setConfig] = useState<SaleAccountConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Solo cuentas de tipo ACTIVO para métodos de pago
  const activoAccounts = accounts.filter(a => a.type === 'ACTIVO').sort((a, b) =>
    a.codigo.localeCompare(b.codigo, 'es', { numeric: true })
  );

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    loadSaleAccountConfig(companyId)
      .then(cfg => { setConfig(cfg); setDirty(false); })
      .catch(() => toast.error('Error cargando configuración'))
      .finally(() => setLoading(false));
  }, [companyId]);

  function handleChange(tipoPago: TipoPago, accountCodigo: string) {
    setConfig(prev => ({ ...prev, [tipoPago]: accountCodigo }));
    setDirty(true);
  }

  function handleReset(tipoPago: TipoPago) {
    setConfig(prev => {
      const next = { ...prev };
      delete next[tipoPago];
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!companyId) return;
    setSaving(true);
    try {
      await saveSaleAccountConfig(companyId, config);
      setDirty(false);
      toast.success('Configuración guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  function effectiveCodigo(tipoPago: TipoPago): string {
    return config[tipoPago] ?? DEFAULT_PAYMENT_ACCOUNTS[tipoPago];
  }

  function effectiveAccount(tipoPago: TipoPago) {
    const codigo = effectiveCodigo(tipoPago);
    return accounts.find(a => a.codigo === codigo);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground py-6 text-center">Cargando configuración…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Seleccioná qué cuenta del plan de cuentas corresponde a cada método de pago.
            Si no cambiás un método, se usa el código por defecto.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2 shrink-0">
          <Save className="h-4 w-4" />
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Método de pago</TableHead>
              <TableHead className="w-24">Tipo</TableHead>
              <TableHead>Cuenta asignada</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ALL_TIPOS_PAGO.map(tp => {
              const isCustom = !!config[tp];
              const account = effectiveAccount(tp);
              const isCxc = CXC_TIPOS.includes(tp);
              return (
                <TableRow key={tp}>
                  {/* Nombre del método */}
                  <TableCell className="font-medium text-sm">
                    {TIPO_PAGO_LABELS[tp]}
                  </TableCell>

                  {/* Badge tipo */}
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${isCxc ? 'border-blue-300 text-blue-700' : 'border-slate-300 text-slate-600'}`}>
                      {isCxc ? 'CxC' : 'Efectivo/Banco'}
                    </Badge>
                  </TableCell>

                  {/* Selector de cuenta */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={effectiveCodigo(tp)}
                        onValueChange={v => handleChange(tp, v)}
                      >
                        <SelectTrigger className="w-full max-w-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {activoAccounts.map(a => (
                            <SelectItem key={a.id} value={a.codigo}>
                              <span className="font-mono text-xs text-muted-foreground mr-2">{a.codigo}</span>
                              {a.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isCustom && (
                        <Badge className="text-xs bg-amber-100 text-amber-700 border border-amber-300 shrink-0">
                          Personalizado
                        </Badge>
                      )}
                      {!account && (
                        <span className="text-xs text-red-500 shrink-0">
                          Código {effectiveCodigo(tp)} no encontrado
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Botón reset al default */}
                  <TableCell>
                    {isCustom && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        title={`Restaurar default (${DEFAULT_PAYMENT_ACCOUNTS[tp]})`}
                        onClick={() => handleReset(tp)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        * Solo se muestran cuentas de tipo <strong>ACTIVO</strong> del plan de cuentas de tu empresa.
        El ícono <RotateCcw className="inline h-3 w-3" /> restaura el valor por defecto del sistema.
      </p>
    </div>
  );
}
