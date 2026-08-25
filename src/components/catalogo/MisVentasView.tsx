// src/components/catalogo/MisVentasView.tsx
// Perfil del vendedor: sus propias ventas y la comisión que le corresponde.
// Usa la RPC get_my_ventas() — resuelve el vendedor desde auth.uid() del lado
// del servidor, así nunca trae ventas de otros ni datos de costo/margen
// (la tabla `sales` en sí tiene RLS a nivel de empresa completa, no por
// vendedor — por eso esto NO es una consulta directa a la tabla).
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { fmt, round2 } from '@/accounting/utils';
import { DataCard, DataCardHeader, DataCardList } from '@/components/ui/data-card';

interface VentaFila {
  fecha: string;
  numero: string;
  productos: string;
  comision: number;
}

export function MisVentasView() {
  const companyId = useActiveCompanyId();
  const [filas, setFilas] = useState<VentaFila[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_ventas', { p_company_id: companyId });
      if (error) throw error;
      setFilas((data ?? []) as VentaFila[]);
    } catch (e: any) {
      toast.error(e.message || 'Error cargando tus ventas');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  const totalComision = round2(filas.reduce((s, f) => s + f.comision, 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ventas registradas</p>
            <p className="text-lg font-semibold">{filas.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Comisión total</p>
            <p className="text-lg font-semibold text-green-600">Bs {fmt(totalComision)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Móvil: tarjetas */}
      {filas.length === 0 ? (
        <p className="sm:hidden text-center text-sm text-muted-foreground py-6">Todavía no tienes ventas registradas.</p>
      ) : (
        <DataCardList>
          {filas.map((f, i) => (
            <DataCard key={i}>
              <DataCardHeader
                title={<span className="font-mono text-sm">{f.numero}</span>}
                subtitle={f.fecha}
                right={<div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">Comisión</div><div className="font-semibold text-green-600">Bs {fmt(f.comision)}</div></div>}
              />
              <div className="mt-2 pt-2 border-t text-sm">{f.productos}</div>
            </DataCard>
          ))}
        </DataCardList>
      )}

      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>N°</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Todavía no tienes ventas registradas.</TableCell></TableRow>
              ) : (
                filas.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>{f.fecha}</TableCell>
                    <TableCell>{f.numero}</TableCell>
                    <TableCell className="max-w-xs truncate" title={f.productos}>{f.productos}</TableCell>
                    <TableCell className="text-right">Bs {fmt(f.comision)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
