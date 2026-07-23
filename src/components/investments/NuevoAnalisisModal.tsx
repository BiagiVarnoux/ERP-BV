// src/components/investments/NuevoAnalisisModal.tsx
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { InvestmentStorage } from '@/accounting/investment-storage';
import { InvestmentAnalysis } from '@/accounting/investment-types';
import { toDecimal } from '@/accounting/utils';

interface Props {
  open: boolean;
  companyId: string | undefined;
  onClose: () => void;
  onCreated: (a: InvestmentAnalysis) => void;
}

const DEFAULT_FORM = {
  nombre:                  '',
  notas:                   '',
  costo_capital_anual:     12,
  plazo_importacion_meses: 1,
};

export function NuevoAnalisisModal({ open, companyId, onClose, onCreated }: Props) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!companyId) { toast.error('No hay empresa activa'); return; }

    try {
      setSaving(true);
      const a = await InvestmentStorage.create(companyId, {
        nombre:                  form.nombre.trim(),
        notas:                   form.notas.trim() || undefined,
        costo_capital_anual:     form.costo_capital_anual,
        plazo_importacion_meses: form.plazo_importacion_meses,
      });
      toast.success('Análisis creado');
      setForm(DEFAULT_FORM);
      onCreated(a);
    } catch (err) {
      toast.error('Error al crear el análisis');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo análisis de inversión</DialogTitle>
          <DialogDescription>
            Evalúa la rentabilidad de una importación antes de comprar. Es una simulación: no afecta tu contabilidad ni inventario.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              placeholder="Ej: Importación SSDs Q3 2026"
              value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="costo_capital">Costo de capital (% anual)</Label>
              <Input
                id="costo_capital"
                type="number"
                step="0.5"
                min="0"
                value={form.costo_capital_anual}
                onChange={e => setForm(p => ({ ...p, costo_capital_anual: toDecimal(e.target.value) || 0 }))}
              />
              <p className="text-[11px] text-muted-foreground">Tasa para VAN/TIR (cuánto te cuesta el dinero).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plazo_imp">Plazo de importación (meses)</Label>
              <Input
                id="plazo_imp"
                type="number"
                step="0.5"
                min="0"
                value={form.plazo_importacion_meses}
                onChange={e => setForm(p => ({ ...p, plazo_importacion_meses: toDecimal(e.target.value) || 0 }))}
              />
              <p className="text-[11px] text-muted-foreground">Desde que pagas hasta tenerlo en almacén.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Input
              id="notas"
              placeholder="Opcional"
              value={form.notas}
              onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creando...' : 'Crear análisis'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
