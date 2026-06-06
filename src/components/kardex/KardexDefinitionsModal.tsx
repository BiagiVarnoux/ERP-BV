import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { supabase } from '@/integrations/supabase/client';
import { KardexDefinition } from '@/accounting/types';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';

export function KardexDefinitionsModal() {
  const { accounts, kardexDefinitions, setKardexDefinitions } = useAccounting();
  const activeCompanyId = useActiveCompanyId();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const assetAccounts = accounts.filter(a => a.is_active && a.type === 'ACTIVO');

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Ingresa un nombre para el Kárdex');
      return;
    }

    if (!selectedAccountId) {
      toast.error('Selecciona una cuenta');
      return;
    }

    // Verificar si ya existe un kárdex para esta cuenta
    const existingDef = kardexDefinitions.find(d => d.account_id === selectedAccountId);
    if (existingDef) {
      toast.error('Ya existe un Kárdex para esta cuenta');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const { data, error } = await supabase
        .from('kardex_definitions')
        .insert({
          name: name.trim(),
          account_id: selectedAccountId,
          user_id: user.id,
          company_id: activeCompanyId,
        })
        .select()
        .single();

      if (error) throw error;

      setKardexDefinitions([...kardexDefinitions, data]);
      toast.success('Kárdex creado exitosamente');
      setName('');
      setSelectedAccountId('');
    } catch (error: any) {
      toast.error(error.message || 'Error al crear Kárdex');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta definición de Kárdex? Esto NO eliminará los movimientos ya registrados.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('kardex_definitions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setKardexDefinitions(kardexDefinitions.filter(d => d.id !== id));
      toast.success('Definición de Kárdex eliminada');
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          Gestionar Definiciones de Kárdex
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Definiciones de Kárdex</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-medium">Crear Nueva Definición</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Nombre del Kárdex</Label>
                <Input
                  placeholder="Ej. Kárdex USDT"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label>Cuenta de Activo</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {assetAccounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.id} — {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={handleCreate} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Crear
                </Button>
              </div>
            </div>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kardexDefinitions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No hay definiciones de Kárdex. Crea una para comenzar.
                    </TableCell>
                  </TableRow>
                ) : (
                  kardexDefinitions.map((def) => {
                    const account = accounts.find(a => a.id === def.account_id);
                    return (
                      <TableRow key={def.id}>
                        <TableCell className="font-medium">{def.name}</TableCell>
                        <TableCell>
                          {def.account_id} — {account?.name || 'Cuenta no encontrada'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(def.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
