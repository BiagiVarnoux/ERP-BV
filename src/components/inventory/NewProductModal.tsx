import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAccounting } from '@/accounting/AccountingProvider';
import { toast } from 'sonner';
import { DEFAULT_COMPANY_ID } from '@/lib/constants';
import { Archive } from 'lucide-react';

const CATEGORIAS = [
  { value: 'electronica', label: 'Electrónica/Tecnología' },
  { value: 'juguetes', label: 'Juguetes' },
  { value: 'repuestos', label: 'Repuestos' },
  { value: 'otros', label: 'Otros' },
];

export interface ProductData {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string | null;
  cuenta_inventario_id: string | null;
  descripcion: string | null;
  unidad_medida: string;
  metodo_valuacion: string;
  precio_minimo: number | null;
  is_active: boolean;
  status: 'activo' | 'archivado' | 'descontinuado';
  archived_at: string | null;
  archived_reason: string | null;
  user_id: string;
  company_id: string;
}

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editProduct?: ProductData | null;
}

export function NewProductModal({ isOpen, onClose, onSaved, editProduct }: NewProductModalProps) {
  const { accounts } = useAccounting();
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [categoria, setCategoria] = useState('otros');
  const [cuentaId, setCuentaId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [unidadMedida, setUnidadMedida] = useState('unidad');
  const [precioMinimo, setPrecioMinimo] = useState('');
  const [saving, setSaving] = useState(false);

  const isEditing = !!editProduct;
  const activoAccounts = accounts.filter(a => a.type === 'ACTIVO' && a.is_active);

  useEffect(() => {
    if (editProduct) {
      setNombre(editProduct.nombre);
      setCodigo(editProduct.codigo);
      setCategoria(editProduct.categoria || 'otros');
      setCuentaId(editProduct.cuenta_inventario_id || '');
      setDescripcion(editProduct.descripcion || '');
      setUnidadMedida(editProduct.unidad_medida || 'unidad');
      setPrecioMinimo(editProduct.precio_minimo != null ? String(editProduct.precio_minimo) : '');
    } else {
      resetFields();
    }
  }, [editProduct, isOpen]);

  function resetFields() {
    setNombre(''); setCodigo(''); setCategoria('otros'); setCuentaId(''); setDescripcion(''); setUnidadMedida('unidad'); setPrecioMinimo('');
  }

  async function handleSave() {
    if (!nombre.trim() || !codigo.trim()) {
      toast.error('Nombre y código son requeridos');
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const payload = {
        nombre: nombre.trim(),
        codigo: codigo.trim(),
        categoria,
        cuenta_inventario_id: cuentaId || null,
        descripcion: descripcion.trim() || null,
        unidad_medida: unidadMedida.trim() || 'unidad',
        precio_minimo: precioMinimo !== '' ? parseFloat(precioMinimo) : null,
      };

      if (isEditing) {
        const { error } = await supabase.from('products').update(payload).eq('id', editProduct!.id);
        if (error) throw error;
        toast.success('Producto actualizado');
      } else {
        const { error } = await supabase.from('products').insert({ ...payload, user_id: user.id, company_id: DEFAULT_COMPANY_ID });
        if (error) throw error;
        toast.success('Producto creado');
      }

      onSaved();
      resetAndClose();
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar producto');
    } finally {
      setSaving(false);
    }
  }

  function resetAndClose() {
    resetFields();
    onClose();
  }

  const isArchivedOrDiscontinued = isEditing && editProduct && editProduct.status !== 'activo';

  return (
    <Dialog open={isOpen} onOpenChange={v => !v && resetAndClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
        </DialogHeader>
        {isArchivedOrDiscontinued && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <Archive className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Este producto está <strong>{editProduct!.status}</strong>. Editar sus datos no lo reactivará.
              Para reactivarlo, usa la sección de productos archivados en el inventario.
            </p>
          </div>
        )}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del producto" />
          </div>
          <div className="space-y-2">
            <Label>Código/SKU *</Label>
            <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="SKU-001" />
          </div>
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cuenta Contable (Activo)</Label>
            <Select value={cuentaId} onValueChange={setCuentaId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
              <SelectContent>
                {activoAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.id} — {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Descripción opcional" />
          </div>
          <div className="space-y-2">
            <Label>Unidad de medida</Label>
            <Input value={unidadMedida} onChange={e => setUnidadMedida(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Precio mínimo de venta (Bs)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Sin límite"
              value={precioMinimo}
              onChange={e => setPrecioMinimo(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              El modal de ventas alertará si el precio neto cae por debajo de este valor.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
