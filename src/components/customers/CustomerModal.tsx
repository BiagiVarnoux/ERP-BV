import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { createCustomer, updateCustomer } from '@/domain/customers';
import type { CustomerRow, CreateCustomerInput, CustomerTipo } from '@/domain/customers';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (customer: CustomerRow) => void;
  initialName?: string;
  editCustomer?: CustomerRow | null;
}

const emptyForm = (): CreateCustomerInput & { credito_autorizado: number; dias_credito: number } => ({
  razon_social: '',
  nombre_corto: '',
  tipo: 'empresa',
  nit: '',
  email: '',
  telefono: '',
  ciudad: '',
  credito_autorizado: 0,
  dias_credito: 0,
  notas: '',
});

export function CustomerModal({ isOpen, onClose, onSaved, initialName, editCustomer }: Props) {
  const activeCompanyId = useActiveCompanyId();
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    if (editCustomer) {
      setForm({
        razon_social: editCustomer.razon_social,
        nombre_corto: editCustomer.nombre_corto ?? '',
        tipo: editCustomer.tipo,
        nit: editCustomer.nit ?? '',
        email: editCustomer.email ?? '',
        telefono: editCustomer.telefono ?? '',
        ciudad: editCustomer.ciudad ?? '',
        credito_autorizado: editCustomer.credito_autorizado,
        dias_credito: editCustomer.dias_credito,
        notas: editCustomer.notas ?? '',
      });
    } else {
      const f = emptyForm();
      if (initialName) f.razon_social = initialName;
      setForm(f);
    }
  }, [isOpen, editCustomer, initialName]);

  function set(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const e = { ...prev }; delete e[field]; return e; });
  }

  async function validate(): Promise<boolean> {
    const errs: Record<string, string> = {};
    if (!form.razon_social.trim() || form.razon_social.trim().length < 3) {
      errs.razon_social = 'Mínimo 3 caracteres';
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Formato de email inválido';
    }
    if (form.nit && form.nit.trim()) {
      // Verificar unicidad de NIT
      const query = supabase
        .from('customers')
        .select('id')
        .eq('company_id', activeCompanyId)
        .eq('nit', form.nit.trim());
      if (editCustomer) query.neq('id', editCustomer.id);
      const { data } = await query.limit(1);
      if (data && data.length > 0) {
        errs.nit = 'Ya existe un cliente con este NIT en la empresa';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const valid = await validate();
      if (!valid) return;

      const input: CreateCustomerInput = {
        razon_social: form.razon_social.trim(),
        nombre_corto: form.nombre_corto?.trim() || undefined,
        tipo: form.tipo as CustomerTipo,
        nit: form.nit?.trim() || undefined,
        email: form.email?.trim() || undefined,
        telefono: form.telefono?.trim() || undefined,
        ciudad: form.ciudad?.trim() || undefined,
        credito_autorizado: form.credito_autorizado,
        dias_credito: form.dias_credito,
        notas: form.notas?.trim() || undefined,
      };

      let saved: CustomerRow;
      if (editCustomer) {
        saved = await updateCustomer(editCustomer.id, input);
        toast.success('Cliente actualizado');
      } else {
        saved = await createCustomer(input);
        toast.success('Cliente creado');
      }
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar cliente');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={o => !o && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editCustomer ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Razón Social <span className="text-destructive">*</span></Label>
            <Input
              value={form.razon_social}
              onChange={e => set('razon_social', e.target.value)}
              placeholder="Nombre completo de la empresa o persona"
            />
            {errors.razon_social && <p className="text-xs text-destructive mt-1">{errors.razon_social}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Nombre Corto</Label>
              <Input
                value={form.nombre_corto ?? ''}
                onChange={e => set('nombre_corto', e.target.value)}
                placeholder="Alias o abreviatura"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => set('tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="natural">Persona natural</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>NIT</Label>
            <Input
              value={form.nit ?? ''}
              onChange={e => set('nit', e.target.value)}
              placeholder="Número de identificación tributaria"
            />
            {errors.nit && <p className="text-xs text-destructive mt-1">{errors.nit}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={e => set('email', e.target.value)}
                placeholder="correo@ejemplo.com"
              />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                value={form.telefono ?? ''}
                onChange={e => set('telefono', e.target.value)}
                placeholder="+591 xxx xxxx"
              />
            </div>
          </div>

          <div>
            <Label>Ciudad</Label>
            <Input
              value={form.ciudad ?? ''}
              onChange={e => set('ciudad', e.target.value)}
              placeholder="La Paz, Santa Cruz, etc."
            />
          </div>

          <Collapsible open={creditOpen} onOpenChange={setCreditOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                Configuración de crédito (opcional)
                <ChevronDown className={`w-4 h-4 transition-transform ${creditOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Crédito autorizado (Bs)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.credito_autorizado}
                    onChange={e => set('credito_autorizado', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Días de crédito</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={form.dias_credito}
                    onChange={e => set('dias_credito', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {saving ? 'Guardando...' : editCustomer ? 'Actualizar' : 'Crear cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
