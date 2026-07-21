import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAccounting } from '@/accounting/AccountingProvider';
import { toast } from 'sonner';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { Archive, RefreshCw } from 'lucide-react';
import { CONDICION_OPTIONS, condicionCode, tipoInventarioCode } from '@/accounting/product-condicion';
import { useProductTipos } from '@/hooks/useProductTipos';

export interface ProductCategory {
  id: string;
  company_id: string;
  nombre: string;
  codigo: string;
}

export interface ProductData {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string | null;
  cuenta_inventario_id: string | null;
  especificacion: string | null;
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
  condicion: string | null;
  category_id: string | null;
  tipo_inventario: string | null;
}

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editProduct?: ProductData | null;
}

/** Prefijo del SKU sin el secuencial final (ej. "ELE-CEL-NVO"). */
export function buildSkuPrefix(tipoCode: string, categoryCode: string, condCode: string): string {
  return `${tipoCode}-${categoryCode.toUpperCase()}-${condCode}`;
}

/**
 * Siguiente secuencial disponible para un prefijo de SKU dado, buscando el
 * máximo entre los productos YA GUARDADOS con ese mismo prefijo (no un
 * conteo global de la empresa — cada prefijo tiene su propia numeración).
 */
export async function fetchNextSkuSequence(companyId: string, prefix: string): Promise<number> {
  const { data, error } = await supabase
    .from('products')
    .select('codigo')
    .eq('company_id', companyId)
    .like('codigo', `${prefix}-%`);
  if (error) throw error;
  let max = 0;
  for (const row of data ?? []) {
    const m = /-(\d+)$/.exec(row.codigo ?? '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export function buildSku(tipoCode: string, categoryCode: string, condCode: string, seq: number): string {
  return `${buildSkuPrefix(tipoCode, categoryCode, condCode)}-${String(seq).padStart(4, '0')}`;
}

export function NewProductModal({ isOpen, onClose, onSaved, editProduct }: NewProductModalProps) {
  const { accounts } = useAccounting();
  const activeCompanyId = useActiveCompanyId();
  const { tipos } = useProductTipos();
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [especificacion, setEspecificacion] = useState('');
  const [cuentaId, setCuentaId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [unidadMedida, setUnidadMedida] = useState('unidad');
  const [precioMinimo, setPrecioMinimo] = useState('');
  const [condicion, setCondicion] = useState('nuevo');
  const [categoryId, setCategoryId] = useState('');
  const [tipoInventario, setTipoInventario] = useState('electronica');
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [skuGenerating, setSkuGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEditing = !!editProduct;
  const activoAccounts = accounts.filter(a => a.type === 'ACTIVO' && a.is_active);

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('product_categories')
      .select('id, company_id, nombre, codigo')
      .eq('company_id', activeCompanyId)
      .order('nombre');
    setCategories((data ?? []) as ProductCategory[]);
  }, [activeCompanyId]);

  useEffect(() => {
    if (!isOpen) return;
    loadCategories();
    if (editProduct) {
      setNombre(editProduct.nombre);
      setCodigo(editProduct.codigo);
      setEspecificacion(editProduct.especificacion || '');
      setCuentaId(editProduct.cuenta_inventario_id || '');
      setDescripcion(editProduct.descripcion || '');
      setUnidadMedida(editProduct.unidad_medida || 'unidad');
      setPrecioMinimo(editProduct.precio_minimo != null ? String(editProduct.precio_minimo) : '');
      setCondicion(editProduct.condicion || 'nuevo');
      setCategoryId(editProduct.category_id || '');
      setTipoInventario(editProduct.tipo_inventario || 'electronica');
    } else {
      resetFields();
    }
  }, [editProduct, isOpen, loadCategories]);

  function resetFields() {
    setNombre(''); setCodigo(''); setEspecificacion(''); setCuentaId('');
    setDescripcion(''); setUnidadMedida('unidad'); setPrecioMinimo('');
    setCondicion('nuevo'); setCategoryId(''); setTipoInventario('electronica');
  }

  async function handleGenerateSku() {
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) { toast.error('Selecciona una categoría primero'); return; }
    setSkuGenerating(true);
    try {
      const tipoCode = tipoInventarioCode(tipoInventario, tipos);
      const condCode = condicionCode(condicion);
      const prefix = buildSkuPrefix(tipoCode, cat.codigo, condCode);
      const seq = await fetchNextSkuSequence(activeCompanyId, prefix);
      setCodigo(buildSku(tipoCode, cat.codigo, condCode, seq));
    } finally {
      setSkuGenerating(false);
    }
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
        especificacion: especificacion.trim() || null,
        categoria: categories.find(c => c.id === categoryId)?.nombre || null,
        cuenta_inventario_id: cuentaId || null,
        descripcion: descripcion.trim() || null,
        unidad_medida: unidadMedida.trim() || 'unidad',
        precio_minimo: precioMinimo !== '' ? parseFloat(precioMinimo) : null,
        condicion: condicion || null,
        category_id: categoryId || null,
        tipo_inventario: tipoInventario || null,
      };

      if (isEditing) {
        const { error } = await supabase.from('products').update(payload).eq('id', editProduct!.id).eq('company_id', activeCompanyId);
        if (error) throw error;
        toast.success('Producto actualizado');
      } else {
        // metodo_valuacion explícito solo al crear (al editar no se toca, para
        // no cambiarle el método a un producto existente sin querer).
        const { error } = await supabase.from('products').insert({ ...payload, metodo_valuacion: 'FIFO', user_id: user.id, company_id: activeCompanyId });
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
  const selectedCat = categories.find(c => c.id === categoryId);
  const skuPreview = selectedCat
    ? buildSku(tipoInventarioCode(tipoInventario, tipos), selectedCat.codigo, condicionCode(condicion), 0).replace('-0000', '-NNNN')
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={v => !v && resetAndClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
            <Label>Especificación / Variante</Label>
            <Input value={especificacion} onChange={e => setEspecificacion(e.target.value)} placeholder="256GB / Rojo / Bat 87%" />
            <p className="text-xs text-muted-foreground">Diferencia variantes del mismo modelo</p>
          </div>

          {/* Condición */}
          <div className="space-y-2">
            <Label>Condición</Label>
            <Select value={condicion} onValueChange={setCondicion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDICION_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de inventario */}
          <div className="space-y-2">
            <Label>Tipo de inventario</Label>
            {tipos.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">
                No hay tipos de inventario creados. Ve a <strong>Ajustes → Categorías</strong> para crear los tuyos.
              </p>
            ) : (
              <Select value={tipoInventario} onValueChange={setTipoInventario}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tipos.map(t => (
                    <SelectItem key={t.id} value={t.valor}>{t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Categoría de inventario */}
          <div className="space-y-2">
            <Label>Categoría</Label>
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">
                No hay categorías creadas. Ve a <strong>Ajustes → Categorías</strong> para crear las tuyas.
              </p>
            ) : (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar categoría..." /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-mono text-xs text-muted-foreground mr-1.5">{c.codigo}</span>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* SKU */}
          <div className="space-y-2">
            <Label>Código/SKU *</Label>
            <div className="flex gap-2">
              <Input
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                placeholder={skuPreview ?? 'ELE-CEL-NVO-0001'}
                className="font-mono"
              />
              {!isEditing && selectedCat && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleGenerateSku}
                  disabled={skuGenerating}
                  title="Generar SKU automáticamente"
                >
                  <RefreshCw className={`h-4 w-4 ${skuGenerating ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
            {skuPreview && !codigo && (
              <p className="text-xs text-muted-foreground">
                Formato: <Badge variant="outline" className="font-mono text-xs">{skuPreview}</Badge> — haz clic en ↻ para generar
              </p>
            )}
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
