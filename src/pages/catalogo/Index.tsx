// src/pages/catalogo/Index.tsx
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { VendorCatalogView } from '@/components/catalogo/VendorCatalogView';
import { CatalogManageView } from '@/components/catalogo/CatalogManageView';
import { VentasPorVendedorView } from '@/components/catalogo/VentasPorVendedorView';

export default function CatalogoPage() {
  const { can } = useUserAccess();
  const canManage = can('catalogo_ventas', 'edit');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Catálogo de Ventas</h1>
        <p className="text-sm text-muted-foreground">
          Precios, fotos y comisiones para tus vendedores.
        </p>
      </div>

      {canManage ? (
        <Tabs defaultValue="vendedor">
          <TabsList>
            <TabsTrigger value="vendedor">Vista de Vendedor</TabsTrigger>
            <TabsTrigger value="gestionar">Gestionar</TabsTrigger>
            <TabsTrigger value="ventas">Ventas por Vendedor</TabsTrigger>
          </TabsList>
          <TabsContent value="vendedor" className="pt-4">
            <VendorCatalogView />
          </TabsContent>
          <TabsContent value="gestionar" className="pt-4">
            <CatalogManageView />
          </TabsContent>
          <TabsContent value="ventas" className="pt-4">
            <VentasPorVendedorView />
          </TabsContent>
        </Tabs>
      ) : (
        <VendorCatalogView />
      )}
    </div>
  );
}
