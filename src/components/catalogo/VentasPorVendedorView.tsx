// src/components/catalogo/VentasPorVendedorView.tsx
// Reporte interno (owner/edit únicamente, nunca visible para el rol
// vendedor): qué ventas cerró cada vendedor y cuánta comisión corresponde.
// Solo incluye ventas con vendedor_member_id asignado — sin vendedor no hay
// comisión que pagar. La comisión se calcula EN VIVO uniendo
// sale_items.product_id → products.comision_bs — no es una copia histórica
// (si cambias la comisión de un producto, el reporte usa el valor actual,
// no el vigente al momento de la venta).
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { supabase } from '@/integrations/supabase/client';
import { fmt, round2 } from '@/accounting/utils';

interface SaleItemLite {
  product_id: string;
  product_nombre: string;
  cantidad: number;
}

interface SaleLite {
  id: string;
  numero: string;
  fecha: string;
  vendedor_member_id: string | null;
  sale_items: SaleItemLite[];
}

interface MemberLite {
  member_id: string;
  display_name: string;
  email: string;
}

interface VentaFila {
  id: string;
  numero: string;
  fecha: string;
  vendedorNombre: string;
  productos: string;
  comision: number;
}

export function VentasPorVendedorView() {
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
      const [salesRes, productsRes, membersRes] = await Promise.all([
        supabase
          .from('sales')
          .select('id, numero, fecha, vendedor_member_id, sale_items(product_id, product_nombre, cantidad)')
          .eq('company_id', companyId)
          .eq('estado', 'confirmed')
          .not('vendedor_member_id', 'is', null)
          .order('fecha', { ascending: false }),
        supabase.from('products').select('id, comision_bs').eq('company_id', companyId),
        supabase.rpc('get_company_members_detail', { p_company_id: companyId }),
      ]);
      if (salesRes.error) throw salesRes.error;
      if (productsRes.error) throw productsRes.error;
      if (membersRes.error) throw membersRes.error;

      const comisionByProduct = new Map<string, number>(
        ((productsRes.data ?? []) as Array<{ id: string; comision_bs: number | null }>)
          .map(p => [p.id, Number(p.comision_bs) || 0])
      );
      const nombreByMember = new Map<string, string>(
        ((membersRes.data ?? []) as MemberLite[]).map(m => [m.member_id, m.display_name || m.email])
      );

      // Solo ventas con vendedor asignado — sin vendedor no hay comisión que
      // pagar (evita mostrar comisión "fantasma" en ventas viejas, hechas
      // antes de que existiera este sistema, del mismo producto).
      const sales = (salesRes.data ?? []) as unknown as SaleLite[];
      const rows: VentaFila[] = sales
        .filter((s): s is SaleLite & { vendedor_member_id: string } => s.vendedor_member_id != null)
        .map(s => {
          const comision = round2(
            s.sale_items.reduce((sum, it) => sum + (comisionByProduct.get(it.product_id) ?? 0) * it.cantidad, 0)
          );
          return {
            id: s.id,
            numero: s.numero,
            fecha: s.fecha,
            vendedorNombre: nombreByMember.get(s.vendedor_member_id) ?? 'Vendedor desconocido',
            productos: s.sale_items.map(it => `${it.product_nombre} x${it.cantidad}`).join(', '),
            comision,
          };
        });
      setFilas(rows);
    } catch (e: any) {
      toast.error(e.message || 'Error cargando ventas por vendedor');
    } finally {
      setLoading(false);
    }
  }

  const totalesPorVendedor = filas.reduce<Record<string, number>>((acc, f) => {
    acc[f.vendedorNombre] = round2((acc[f.vendedorNombre] ?? 0) + f.comision);
    return acc;
  }, {});

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(totalesPorVendedor).map(([nombre, total]) => (
          <Card key={nombre}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{nombre}</p>
              <p className="text-lg font-semibold">Bs {fmt(total)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>N°</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Productos</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Sin ventas con comisión registrada.</TableCell></TableRow>
              ) : (
                filas.map(f => (
                  <TableRow key={f.id}>
                    <TableCell>{f.fecha}</TableCell>
                    <TableCell>{f.numero}</TableCell>
                    <TableCell>{f.vendedorNombre}</TableCell>
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
