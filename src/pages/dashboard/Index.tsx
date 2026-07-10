import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, BarChart2, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { fmt, round2 } from '@/accounting/utils';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { CANAL_LABELS } from '@/domain/sales';
import { usePersistedState } from '@/hooks/usePersistedState';
import {
  PeriodFilterBar,
  PeriodFilterValue,
  getDefaultPeriodFilterValue,
  isDateInPeriodFilter,
} from '@/components/shared/PeriodFilterBar';

// ── Types ──────────────────────────────────────────────────────────────────

interface SaleRow {
  id: string;
  fecha: string;
  canal: string;
  con_factura: boolean;
  total_cobrado: number;
  precio_neto_total: number;
  total_costo: number | null;
  estado: string;
  customer_id: string | null;
  cliente_nombre: string | null;
}

interface SaleItem {
  sale_id: string;
  product_nombre: string;
  product_codigo: string | null;
  cantidad: number;
  subtotal_neto: number;
  costo_total: number | null;
  margen_bruto: number | null;
}

// ── Margin badge ────────────────────────────────────────────────────────────

function margenBadge(pct: number) {
  const cls = pct < 5
    ? 'bg-red-100 text-red-700 border-red-300'
    : pct < 20
    ? 'bg-amber-100 text-amber-700 border-amber-300'
    : 'bg-green-100 text-green-700 border-green-300';
  return <Badge variant="outline" className={`text-xs ${cls}`}>{pct.toFixed(1)}%</Badge>;
}

const CANAL_COLORS: Record<string, string> = {
  licitacion: '#6366f1',
  electronica: '#0ea5e9',
  pedido:      '#f59e0b',
  general:     '#10b981',
};

// ── Custom tooltip for recharts ─────────────────────────────────────────────

function BsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover p-2 text-sm shadow-md">
      <p className="font-medium mb-1">{label}</p>
      <p>Bs {fmt(payload[0].value)}</p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SalesDashboardPage() {
  const activeCompanyId = useActiveCompanyId();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [period, setPeriod] = usePersistedState<PeriodFilterValue>('dashboard:period', getDefaultPeriodFilterValue());

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: sData }, { data: iData }] = await Promise.all([
      supabase
        .from('sales')
        .select('id,fecha,canal,con_factura,total_cobrado,precio_neto_total,total_costo,estado,customer_id,cliente_nombre')
        .eq('estado', 'confirmed')
        .eq('company_id', activeCompanyId),
      supabase
        .from('sale_items')
        .select('sale_id,product_nombre,product_codigo,cantidad,subtotal_neto,costo_total,margen_bruto'),
    ]);
    setSales((sData ?? []) as unknown as SaleRow[]);
    setItems((iData ?? []) as unknown as SaleItem[]);
    setLoading(false);
  }

  const filtered = useMemo(
    () => sales.filter(s => isDateInPeriodFilter(s.fecha, period)),
    [sales, period],
  );

  const filteredIds = useMemo(() => new Set(filtered.map(s => s.id)), [filtered]);

  const filteredItems = useMemo(
    () => items.filter(it => filteredIds.has(it.sale_id)),
    [items, filteredIds],
  );

  // ── KPIs ────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalVendido   = round2(filtered.reduce((s, r) => s + r.total_cobrado, 0));
    const ingresoNeto    = round2(filtered.reduce((s, r) => s + r.precio_neto_total, 0));
    const withCost       = filtered.filter(r => r.total_costo !== null);
    const costoTotal     = round2(withCost.reduce((s, r) => s + (r.total_costo ?? 0), 0));
    const netoWithCost   = round2(withCost.reduce((s, r) => s + r.precio_neto_total, 0));
    const margenBruto    = round2(netoWithCost - costoTotal);
    const margenPct      = netoWithCost > 0 ? round2((margenBruto / netoWithCost) * 100) : 0;
    const ticketPromedio = filtered.length > 0 ? round2(totalVendido / filtered.length) : 0;
    return { totalVendido, ingresoNeto, margenBruto, margenPct, ticketPromedio, count: filtered.length };
  }, [filtered]);

  // ── Por canal ───────────────────────────────────────────────────────────

  const canalData = useMemo(() => {
    const map: Record<string, { count: number; total: number; neto: number; costo: number }> = {};
    for (const s of filtered) {
      if (!map[s.canal]) map[s.canal] = { count: 0, total: 0, neto: 0, costo: 0 };
      map[s.canal].count++;
      map[s.canal].total += s.total_cobrado;
      if (s.total_costo !== null) {
        map[s.canal].neto  += s.precio_neto_total;
        map[s.canal].costo += s.total_costo;
      }
    }
    return Object.entries(map).map(([canal, v]) => ({
      canal,
      label: CANAL_LABELS[canal as keyof typeof CANAL_LABELS] ?? canal,
      count: v.count,
      total: round2(v.total),
      margen: round2(v.neto - v.costo),
      margenPct: v.neto > 0 ? round2(((v.neto - v.costo) / v.neto) * 100) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // ── Top productos ───────────────────────────────────────────────────────

  const productData = useMemo(() => {
    const map: Record<string, { nombre: string; cantidad: number; subtotal: number; margen: number }> = {};
    for (const it of filteredItems) {
      const key = it.product_nombre;
      if (!map[key]) map[key] = { nombre: key, cantidad: 0, subtotal: 0, margen: 0 };
      map[key].cantidad += it.cantidad;
      map[key].subtotal += it.subtotal_neto;
      map[key].margen   += it.margen_bruto ?? 0;
    }
    const rows = Object.values(map).map(r => ({
      ...r,
      subtotal: round2(r.subtotal),
      margen:   round2(r.margen),
      margenPct: r.subtotal > 0 ? round2((r.margen / r.subtotal) * 100) : 0,
    }));
    return {
      byValor:  [...rows].sort((a, b) => b.subtotal - a.subtotal).slice(0, 10),
      byMargen: [...rows].sort((a, b) => b.margen  - a.margen).slice(0, 10),
    };
  }, [filteredItems]);

  // ── Top clientes ────────────────────────────────────────────────────────

  const clienteData = useMemo(() => {
    const map: Record<string, { nombre: string; count: number; total: number; neto: number; costo: number }> = {};
    for (const s of filtered) {
      const key = s.cliente_nombre ?? '(Sin nombre)';
      if (!map[key]) map[key] = { nombre: key, count: 0, total: 0, neto: 0, costo: 0 };
      map[key].count++;
      map[key].total += s.total_cobrado;
      if (s.total_costo !== null) {
        map[key].neto  += s.precio_neto_total;
        map[key].costo += s.total_costo;
      }
    }
    return Object.values(map)
      .map(r => ({
        nombre: r.nombre,
        count: r.count,
        total: round2(r.total),
        margen: round2(r.neto - r.costo),
        margenPct: r.neto > 0 ? round2(((r.neto - r.costo) / r.neto) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filtered]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BarChart2 className="w-6 h-6" /> Dashboard de Ventas
        </h1>
        <PeriodFilterBar value={period} onChange={setPeriod} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando datos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <ShoppingCart className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-lg">Sin ventas confirmadas en este período.</p>
          <p className="text-sm mt-1">Prueba con otro rango de fechas.</p>
        </div>
      ) : (
        <>
          {/* SECTION 1 — KPI Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Vendido</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold">Bs {fmt(kpis.totalVendido)}</div>
                <p className="text-xs text-muted-foreground mt-1">{kpis.count} ventas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ingreso Neto</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold">Bs {fmt(kpis.ingresoNeto)}</div>
                <p className="text-xs text-muted-foreground mt-1">sin IVA</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Margen Bruto</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold">Bs {fmt(kpis.margenBruto)}</div>
                <div className="mt-1">{margenBadge(kpis.margenPct)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ticket Promedio</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-bold">Bs {fmt(kpis.ticketPromedio)}</div>
                <p className="text-xs text-muted-foreground mt-1">por venta</p>
              </CardContent>
            </Card>
          </div>

          {/* SECTION 2 — Ventas por Canal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ventas por Canal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={canalData}
                      layout="vertical"
                      margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 12 }} />
                      <Tooltip content={<BsTooltip />} />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                        {canalData.map(entry => (
                          <Cell key={entry.canal} fill={CANAL_COLORS[entry.canal] ?? '#8884d8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Canal</TableHead>
                        <TableHead className="text-right">Ventas</TableHead>
                        <TableHead className="text-right">Total Bs</TableHead>
                        <TableHead className="text-right">Margen Bs</TableHead>
                        <TableHead className="text-right">Margen %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {canalData.map(row => (
                        <TableRow key={row.canal}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right">{row.count}</TableCell>
                          <TableCell className="text-right">Bs {fmt(row.total)}</TableCell>
                          <TableCell className="text-right">Bs {fmt(row.margen)}</TableCell>
                          <TableCell className="text-right">{margenBadge(row.margenPct)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SECTION 3 — Top Productos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 — Por Valor Vendido</CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Unid.</TableHead>
                      <TableHead className="text-right">Total Bs</TableHead>
                      <TableHead className="text-right">Margen Bs</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productData.byValor.map(row => (
                      <TableRow key={row.nombre}>
                        <TableCell className="text-sm max-w-[160px] truncate">{row.nombre}</TableCell>
                        <TableCell className="text-right">{row.cantidad}</TableCell>
                        <TableCell className="text-right">Bs {fmt(row.subtotal)}</TableCell>
                        <TableCell className="text-right">Bs {fmt(row.margen)}</TableCell>
                        <TableCell className="text-right">{margenBadge(row.margenPct)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 — Por Margen</CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Total Bs</TableHead>
                      <TableHead className="text-right">Margen Bs</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productData.byMargen.map(row => (
                      <TableRow key={row.nombre}>
                        <TableCell className="text-sm max-w-[160px] truncate">{row.nombre}</TableCell>
                        <TableCell className="text-right">Bs {fmt(row.subtotal)}</TableCell>
                        <TableCell className="text-right">Bs {fmt(row.margen)}</TableCell>
                        <TableCell className="text-right">{margenBadge(row.margenPct)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* SECTION 4 — Top Clientes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Clientes</CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Nº Ventas</TableHead>
                    <TableHead className="text-right">Total Cobrado</TableHead>
                    <TableHead className="text-right">Margen Bruto</TableHead>
                    <TableHead className="text-right">Margen %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clienteData.map(row => (
                    <TableRow key={row.nombre}>
                      <TableCell className="font-medium">{row.nombre}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right">Bs {fmt(row.total)}</TableCell>
                      <TableCell className="text-right">Bs {fmt(row.margen)}</TableCell>
                      <TableCell className="text-right">{margenBadge(row.margenPct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
