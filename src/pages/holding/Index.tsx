import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, TrendingUp, TrendingDown, Building2, AlertCircle } from 'lucide-react';
import { round2, fmt } from '@/accounting/utils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CompanyKpis {
  company_id: string;
  company_name: string;
  currency: string;
  total_activos: number;
  total_pasivos: number;
  total_patrimonio: number;
  ingresos: number;
  gastos: number;
  resultado_neto: number;
  ventas_mes: number;
  cxc_pendiente: number;
  cxp_pendiente: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, currency, highlight,
}: {
  label: string;
  value: number;
  currency?: string;
  highlight?: 'positive' | 'negative' | 'neutral';
}) {
  const color =
    highlight === 'positive' ? 'text-green-600 dark:text-green-400' :
    highlight === 'negative' ? 'text-red-600 dark:text-red-400' :
    'text-foreground';

  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className={`text-xl font-bold ${color}`}>
          {currency && <span className="text-sm font-normal text-muted-foreground mr-1">{currency}</span>}
          {fmt(value)}
        </p>
      </CardContent>
    </Card>
  );
}

function ResultBadge({ value }: { value: number }) {
  if (value > 0) return (
    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1">
      <TrendingUp className="h-3 w-3" />{fmt(value)}
    </Badge>
  );
  if (value < 0) return (
    <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 gap-1">
      <TrendingDown className="h-3 w-3" />{fmt(value)}
    </Badge>
  );
  return <Badge variant="secondary">{fmt(value)}</Badge>;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function HoldingPage() {
  const { companies } = useUserAccess();
  const { toast } = useToast();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [data, setData] = useState<CompanyKpis[]>([]);
  const [loading, setLoading] = useState(true);

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  useEffect(() => {
    loadSummary();
  }, [selectedYear]);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase.rpc('get_holding_summary', {
        p_year: selectedYear,
      });
      if (error) throw error;
      setData((rows as CompanyKpis[]) || []);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Totales consolidados
  const totals = data.reduce(
    (acc, c) => ({
      activos:    acc.activos    + c.total_activos,
      pasivos:    acc.pasivos    + c.total_pasivos,
      patrimonio: acc.patrimonio + c.total_patrimonio,
      ingresos:   acc.ingresos   + c.ingresos,
      gastos:     acc.gastos     + c.gastos,
      resultado:  acc.resultado  + c.resultado_neto,
      ventas_mes: acc.ventas_mes + c.ventas_mes,
      cxc:        acc.cxc        + c.cxc_pendiente,
      cxp:        acc.cxp        + c.cxp_pendiente,
    }),
    { activos: 0, pasivos: 0, patrimonio: 0, ingresos: 0, gastos: 0, resultado: 0, ventas_mes: 0, cxc: 0, cxp: 0 },
  );

  if (companies.length < 1) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Sin empresas registradas
            </CardTitle>
            <CardDescription>
              Crea o únete a empresas para ver el dashboard del holding.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-7 w-7" />
            Holding — Vista Consolidada
          </h1>
          <p className="text-muted-foreground">
            {data.length} empresa{data.length !== 1 ? 's' : ''} · Gestión {selectedYear}
          </p>
        </div>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPIs consolidados */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Consolidado grupo
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <KpiCard label="Total Activos"     value={totals.activos}    highlight="neutral" />
              <KpiCard label="Total Pasivos"     value={totals.pasivos}    highlight="neutral" />
              <KpiCard label="Patrimonio"        value={totals.patrimonio} highlight="neutral" />
              <KpiCard label="Ingresos"          value={totals.ingresos}   highlight="positive" />
              <KpiCard label="Resultado Neto"    value={totals.resultado}  highlight={totals.resultado >= 0 ? 'positive' : 'negative'} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <KpiCard label="Gastos"            value={totals.gastos}     highlight="negative" />
              <KpiCard label="Ventas (mes)"      value={totals.ventas_mes} highlight="positive" />
              <KpiCard label="CxC Pendiente"     value={totals.cxc}        highlight="neutral" />
              <KpiCard label="CxP Pendiente"     value={totals.cxp}        highlight="neutral" />
            </div>
          </div>

          {/* Tabla por empresa */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desglose por empresa</CardTitle>
              <CardDescription>Gestión {selectedYear}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="text-right">Activos</TableHead>
                    <TableHead className="text-right">Pasivos</TableHead>
                    <TableHead className="text-right">Patrimonio</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Gastos</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                    <TableHead className="text-right">Ventas mes</TableHead>
                    <TableHead className="text-right">CxC</TableHead>
                    <TableHead className="text-right">CxP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map(c => (
                    <TableRow key={c.company_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{c.company_name}</p>
                          <p className="text-xs text-muted-foreground">{c.currency}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(c.total_activos)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(c.total_pasivos)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(c.total_patrimonio)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-green-700 dark:text-green-400">{fmt(c.ingresos)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-700 dark:text-red-400">{fmt(c.gastos)}</TableCell>
                      <TableCell className="text-right">
                        <ResultBadge value={round2(c.resultado_neto)} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(c.ventas_mes)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(c.cxc_pendiente)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(c.cxp_pendiente)}</TableCell>
                    </TableRow>
                  ))}

                  {/* Fila de totales */}
                  {data.length > 1 && (
                    <TableRow className="border-t-2 font-bold bg-muted/40">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right font-mono">{fmt(totals.activos)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(totals.pasivos)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(totals.patrimonio)}</TableCell>
                      <TableCell className="text-right font-mono text-green-700 dark:text-green-400">{fmt(totals.ingresos)}</TableCell>
                      <TableCell className="text-right font-mono text-red-700 dark:text-red-400">{fmt(totals.gastos)}</TableCell>
                      <TableCell className="text-right">
                        <ResultBadge value={round2(totals.resultado)} />
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmt(totals.ventas_mes)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(totals.cxc)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(totals.cxp)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
