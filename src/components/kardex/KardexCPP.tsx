import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableRow, TableHeader } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useUserAccess, useActiveCompanyId } from '@/contexts/UserAccessContext';
import { KardexMovement } from '@/accounting/types';
import { supabase } from '@/integrations/supabase/client';
import { fmt, todayISO } from '@/accounting/utils';
import { KardexDefinitionsModal } from './KardexDefinitionsModal';
import { calculateCPP } from '@/accounting/kardex-utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function KardexCPP() {
  const { accounts, kardexDefinitions } = useAccounting();
  const { isReadOnly } = useUserAccess();
  const activeCompanyId = useActiveCompanyId();
  const [selectedKardexDefId, setSelectedKardexDefId] = useState<string>('');
  const [kardexId, setKardexId] = useState<string>('');
  const [movements, setMovements] = useState<KardexMovement[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [movementToDelete, setMovementToDelete] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    fecha: todayISO(),
    concepto: '',
    entrada: '0',
    salidas: '0',
    costo_total: '0',
  });

  const selectedKardexDef = kardexDefinitions.find(d => d.id === selectedKardexDefId);
  const selectedAccount = accounts.find(a => a.id === selectedKardexDef?.account_id);

  // Load or create kardex when definition is selected
  useEffect(() => {
    if (!selectedKardexDefId || !selectedKardexDef) {
      setKardexId('');
      setMovements([]);
      return;
    }

    const loadKardex = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Try to find existing kardex for this account
        const { data: existingKardex, error: kardexError } = await supabase
          .from('kardex_entries')
          .select('id')
          .eq('account_id', selectedKardexDef.account_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (kardexError) throw kardexError;

        let currentKardexId = existingKardex?.id;

        // If no kardex exists, create one
        if (!currentKardexId) {
          const { data: newKardex, error: createError } = await supabase
            .from('kardex_entries')
            .insert({
              account_id: selectedKardexDef.account_id,
              user_id: user.id,
              company_id: activeCompanyId,
            })
            .select()
            .single();

          if (createError) throw createError;
          currentKardexId = newKardex.id;
        }

        setKardexId(currentKardexId);

        // Load movements
        const { data: movementsData, error: movError } = await supabase
          .from('kardex_movements')
          .select('*')
          .eq('kardex_id', currentKardexId)
          .order('fecha', { ascending: true });

        if (movError) throw movError;
        setMovements(movementsData || []);
      } catch (error: any) {
        toast.error('Error al cargar kárdex: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    loadKardex();
  }, [selectedKardexDefId, selectedKardexDef]);

  // Calculate CPP for each movement using centralized utility
  const movementsWithCPP = useMemo(() => {
    return calculateCPP(movements);
  }, [movements]);

  const handleOpenModal = () => {
    setFormData({
      fecha: todayISO(),
      concepto: '',
      entrada: '0',
      salidas: '0',
      costo_total: '0',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!kardexId) {
      toast.error('Selecciona una cuenta primero');
      return;
    }

    if (!formData.concepto.trim()) {
      toast.error('El concepto es requerido');
      return;
    }

    const entrada = parseFloat(formData.entrada) || 0;
    const salidas = parseFloat(formData.salidas) || 0;

    if (entrada === 0 && salidas === 0) {
      toast.error('Debe haber entrada o salida');
      return;
    }

    if (entrada > 0 && salidas > 0) {
      toast.error('No puede haber entrada y salida al mismo tiempo');
      return;
    }

    const costoTotal = parseFloat(formData.costo_total) || 0;

    if (entrada > 0 && costoTotal === 0) {
      toast.error('Para entradas, el costo total es requerido');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('kardex_movements')
        .insert({
          kardex_id: kardexId,
          user_id: user.id,
          company_id: activeCompanyId,
          fecha: formData.fecha,
          concepto: formData.concepto.trim(),
          entrada,
          salidas,
          costo_total: costoTotal,
          saldo: 0,
          costo_unitario: 0,
          saldo_valorado: 0,
        });

      if (error) throw error;

      // Reload movements
      const { data: movementsData, error: movError } = await supabase
        .from('kardex_movements')
        .select('*')
        .eq('kardex_id', kardexId)
        .order('fecha', { ascending: true });

      if (movError) throw movError;
      setMovements(movementsData || []);
      
      toast.success('Movimiento agregado exitosamente');
      setIsModalOpen(false);
    } catch (error: any) {
      toast.error('Error al guardar: ' + error.message);
    }
  };

  const handleDeleteClick = (id: string) => {
    setMovementToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!movementToDelete) return;

    try {
      const { error } = await supabase
        .from('kardex_movements')
        .delete()
        .eq('id', movementToDelete);

      if (error) throw error;

      // Reload movements
      const { data: movementsData, error: movError } = await supabase
        .from('kardex_movements')
        .select('*')
        .eq('kardex_id', kardexId)
        .order('fecha', { ascending: true });

      if (movError) throw movError;
      setMovements(movementsData || []);
      
      toast.success('Movimiento eliminado');
      setDeleteDialogOpen(false);
      setMovementToDelete(null);
    } catch (error: any) {
      toast.error('Error al eliminar: ' + error.message);
      setDeleteDialogOpen(false);
      setMovementToDelete(null);
    }
  };

  const handleExport = () => {
    if (movementsWithCPP.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const headers = ['Fecha', 'Concepto', 'Entrada', 'Salidas', 'Saldo', 'Costo Unitario', 'Costo Total', 'Saldo Valorado'];
    const rows = movementsWithCPP.map(m => [
      m.fecha,
      m.concepto,
      m.entrada.toString(),
      m.salidas.toString(),
      m.saldo.toFixed(2),
      m.costo_unitario.toFixed(2),
      m.costo_total.toFixed(2),
      m.saldo_valorado.toFixed(2)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex_${selectedKardexDef?.name}_${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Kárdex exportado');
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Seleccionar Kárdex</CardTitle>
            {!isReadOnly && <KardexDefinitionsModal />}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Kárdex Creado</Label>
              <Select value={selectedKardexDefId} onValueChange={setSelectedKardexDefId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un Kárdex" />
                </SelectTrigger>
                <SelectContent>
                  {kardexDefinitions.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      No hay Kárdex creados
                    </SelectItem>
                  ) : (
                    kardexDefinitions.map(def => {
                      const account = accounts.find(a => a.id === def.account_id);
                      return (
                        <SelectItem key={def.id} value={def.id}>
                          {def.name} ({def.account_id} — {account?.name})
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              {kardexDefinitions.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Crea definiciones de Kárdex para comenzar
                </p>
              )}
            </div>
            <div className="flex items-end gap-2">
              {!isReadOnly && (
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <Button 
                    onClick={handleOpenModal} 
                    disabled={!selectedKardexDefId || loading}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Movimiento
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nuevo Movimiento de Kárdex</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Fecha</Label>
                      <Input
                        type="date"
                        value={formData.fecha}
                        onChange={(e) => setFormData(prev => ({ ...prev, fecha: e.target.value }))}
                      />
                    </div>
                    
                    <div>
                      <Label>Concepto</Label>
                      <Input
                        value={formData.concepto}
                        onChange={(e) => setFormData(prev => ({ ...prev, concepto: e.target.value }))}
                        placeholder="Ej. Compra Lote 1, Venta P2P"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Entrada (Unidades)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.entrada}
                          onChange={(e) => setFormData(prev => ({ ...prev, entrada: e.target.value, salidas: '0' }))}
                          placeholder="0"
                        />
                      </div>
                      
                      <div>
                        <Label>Salidas (Unidades)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={formData.salidas}
                          onChange={(e) => setFormData(prev => ({ ...prev, salidas: e.target.value, entrada: '0' }))}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label>Costo Total (Bs.)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.costo_total}
                        onChange={(e) => setFormData(prev => ({ ...prev, costo_total: e.target.value }))}
                        placeholder="0.00"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Para entradas: monto total de la compra. Para salidas: se calcula automáticamente.
                      </p>
                    </div>
                    
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSave}>
                        Guardar
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              )}
              
              <Button
                variant="outline" 
                onClick={handleExport}
                disabled={!selectedKardexDefId || movements.length === 0}
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedKardexDefId && selectedKardexDef && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>
              {selectedKardexDef.name} — Kárdex de {selectedAccount?.name} ({selectedAccount?.id}) — Costo Promedio Ponderado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Cargando...
              </div>
            ) : (
              <div className="border rounded-xl overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Concepto</TableHead>
                      <TableHead className="text-right">Entrada</TableHead>
                      <TableHead className="text-right">Salidas</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Costo Unitario</TableHead>
                      <TableHead className="text-right">Costo Total</TableHead>
                      <TableHead className="text-right">Saldo Valorado</TableHead>
                      {!isReadOnly && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movementsWithCPP.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground">
                          No hay movimientos registrados. Agrega el primer movimiento.
                        </TableCell>
                      </TableRow>
                    ) : (
                      movementsWithCPP.map((mov) => (
                        <TableRow key={mov.id}>
                          <TableCell>{mov.fecha}</TableCell>
                          <TableCell>{mov.concepto}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {mov.entrada > 0 ? fmt(mov.entrada) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-medium text-red-600">
                            {mov.salidas > 0 ? fmt(mov.salidas) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {fmt(mov.saldo)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmt(mov.costo_unitario)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmt(mov.costo_total)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-blue-600">
                            {fmt(mov.saldo_valorado)}
                          </TableCell>
                          {!isReadOnly && (
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteClick(mov.id)}
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                          )}
                        </TableRow>
                       ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar movimiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El movimiento será eliminado permanentemente
              y se recalcularán los saldos subsiguientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
