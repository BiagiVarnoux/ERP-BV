import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

// ─── Definición estática de módulos y submódulos ───────────────────────────────

interface SubmoduleDef {
  key: string;
  label: string;
  description: string;
}

interface ModuleDef {
  label: string;
  badge: string;
  submodules: SubmoduleDef[];
}

const MODULE_TREE: ModuleDef[] = [
  {
    label: 'Finanzas', badge: 'FI',
    submodules: [
      { key: 'accounts',          label: 'Plan de Cuentas',    description: 'Catálogo de cuentas contables' },
      { key: 'journal',           label: 'Libro Diario',       description: 'Registro de asientos contables' },
      { key: 'ledger',            label: 'Libro Mayor',        description: 'Saldos por cuenta' },
      { key: 'auxiliary_ledgers', label: 'Libros Auxiliares',  description: 'Sub-ledgers de clientes/proveedores' },
      { key: 'receivables',       label: 'Cuentas x Cobrar',   description: 'Gestión de cobranzas' },
      { key: 'payables',          label: 'Cuentas x Pagar',    description: 'Gestión de pagos a proveedores' },
      { key: 'reports',           label: 'Reportes',           description: 'Estados financieros y reportes' },
    ],
  },
  {
    label: 'Materiales', badge: 'MM',
    submodules: [
      { key: 'inventory',  label: 'Inventario', description: 'Kárdex y control de stock' },
      { key: 'shipments',  label: 'Embarques',  description: 'Importaciones y embarques' },
    ],
  },
  {
    label: 'Ventas', badge: 'SD',
    submodules: [
      { key: 'dashboard',  label: 'Dashboard',  description: 'Resumen de ventas del período' },
      { key: 'sales',      label: 'Ventas',     description: 'Registro de ventas' },
      { key: 'customers',  label: 'Clientes',   description: 'Gestión de clientes' },
    ],
  },
  {
    label: 'Inversión', badge: 'INV',
    submodules: [
      { key: 'investments', label: 'Análisis de Inversión', description: 'Evaluación de importaciones: rentabilidad, VAN/TIR y conciliación con embarques' },
    ],
  },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export function ModuleConfigTab() {
  const { companyId, isOwner, moduleConfig, reloadModuleConfig } = useUserAccess();
  const { toast } = useToast();

  // Estado local: copia editable del config
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);   // key que se está guardando
  const [loaded, setLoaded] = useState(false);

  // Inicializar desde el contexto cuando carga
  useEffect(() => {
    setLocal({ ...moduleConfig });
    setLoaded(true);
  }, [moduleConfig]);

  const toggle = async (key: string, newValue: boolean) => {
    if (!isOwner || !companyId) return;

    // Optimistic update
    setLocal(prev => ({ ...prev, [key]: newValue }));
    setSaving(key);

    try {
      const { error } = await supabase.rpc('set_company_module_config', {
        p_company_id: companyId,
        p_submodule: key,
        p_is_visible: newValue,
      });
      if (error) throw error;

      // Recargar en el contexto global para que el sidebar se actualice
      await reloadModuleConfig();

      toast({
        title: newValue ? 'Submódulo activado' : 'Submódulo ocultado',
        description: `Los cambios se aplicaron correctamente.`,
      });
    } catch (e: any) {
      // Revert on error
      setLocal(prev => ({ ...prev, [key]: !newValue }));
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Visibilidad de submódulos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ocultá los submódulos que tu empresa no utiliza. Los datos no se eliminan —
          simplemente dejan de aparecer en el menú.
          {!isOwner && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">
              Solo el propietario puede modificar esta configuración.
            </span>
          )}
        </p>
      </div>

      <div className="space-y-6">
        {MODULE_TREE.map(mod => (
          <div key={mod.badge} className="border rounded-lg overflow-hidden">
            {/* Encabezado del módulo */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b">
              <span className="font-semibold text-sm">{mod.label}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {mod.badge}
              </Badge>
            </div>

            {/* Submódulos */}
            <div className="divide-y">
              {mod.submodules.map(sub => {
                const isVisible = local[sub.key] ?? true;
                const isSaving = saving === sub.key;

                return (
                  <div
                    key={sub.key}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${!isVisible ? 'text-muted-foreground' : ''}`}>
                        {sub.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{sub.description}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {!isVisible && (
                        <span className="text-xs text-muted-foreground">Oculto</span>
                      )}
                      {isSaving
                        ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        : (
                          <Switch
                            checked={isVisible}
                            onCheckedChange={val => toggle(sub.key, val)}
                            disabled={!isOwner || isSaving}
                          />
                        )
                      }
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
