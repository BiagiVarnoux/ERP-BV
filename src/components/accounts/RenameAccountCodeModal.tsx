// Modal para renombrar el código de una cuenta del plan de cuentas.
// Muestra el impacto (cuántos registros se actualizarán) antes de confirmar.

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import type { Account } from '@/accounting/types';

interface RenameAccountCodeModalProps {
  account: Account | null;
  existingIds: string[];
  onClose: () => void;
  onRenamed: (oldId: string, newId: string) => void;
}

interface Impact {
  journal_lines: number;
  aux_ledger: number;
  aux_def: number;
  sale_config: number;
}

async function fetchImpact(companyId: string, accountId: string): Promise<Impact> {
  const [lines, auxLedger, auxDef, saleConfig] = await Promise.all([
    supabase
      .from('journal_lines')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId),
    supabase
      .from('auxiliary_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('company_id', companyId),
    supabase
      .from('auxiliary_ledger_definitions')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('company_id', companyId),
    supabase
      .from('company_sale_account_config')
      .select('tipo_pago', { count: 'exact', head: true })
      .eq('account_codigo', accountId)
      .eq('company_id', companyId),
  ]);
  return {
    journal_lines: lines.count ?? 0,
    aux_ledger:    auxLedger.count ?? 0,
    aux_def:       auxDef.count ?? 0,
    sale_config:   saleConfig.count ?? 0,
  };
}

export function RenameAccountCodeModal({
  account, existingIds, onClose, onRenamed,
}: RenameAccountCodeModalProps) {
  const companyId = useActiveCompanyId();
  const [newCode, setNewCode]   = useState('');
  const [impact, setImpact]     = useState<Impact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [saving, setSaving]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!account || !companyId) return;
    setNewCode('');
    setImpact(null);
    setLoadingImpact(true);
    fetchImpact(companyId, account.id)
      .then(setImpact)
      .catch(() => {})
      .finally(() => setLoadingImpact(false));
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [account, companyId]);

  const totalAffected = impact
    ? impact.journal_lines + impact.aux_ledger + impact.aux_def + impact.sale_config
    : 0;

  const codeError = newCode.trim() === ''
    ? null
    : newCode.trim() === account?.id
    ? 'El código nuevo es igual al actual'
    : existingIds.includes(newCode.trim())
    ? `El código "${newCode.trim()}" ya existe en el plan de cuentas`
    : null;

  const canSave = newCode.trim() !== '' && !codeError && !saving;

  async function handleRename() {
    if (!account || !companyId || !canSave) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('rename_account_code', {
        p_company_id: companyId,
        p_old_id:     account.id,
        p_new_id:     newCode.trim(),
      });
      if (error) throw error;
      if (!data?.success) throw new Error('El servidor no confirmó el éxito');

      const j = data.journal_lines ?? 0;
      const a = data.aux_ledger ?? 0;
      toast.success(
        `Código ${account.id} → ${newCode.trim()} · ${j} asiento${j !== 1 ? 's' : ''}, ${a} registro${a !== 1 ? 's' : ''} auxiliares actualizados`
      );
      onRenamed(account.id, newCode.trim());
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Error al renombrar el código');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!account} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renombrar código de cuenta</DialogTitle>
        </DialogHeader>

        {account && (
          <div className="space-y-4 py-1">
            {/* Cuenta actual */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-0.5">Cuenta actual</p>
                <p className="font-semibold text-sm">{account.name}</p>
              </div>
              <Badge variant="outline" className="font-mono text-sm px-3 py-1">
                {account.id}
              </Badge>
            </div>

            {/* Nuevo código */}
            <div className="space-y-1.5">
              <Label>Nuevo código</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-mono text-sm">{account.id}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  ref={inputRef}
                  value={newCode}
                  onChange={e => setNewCode(e.target.value)}
                  placeholder="Ej: A.5.6"
                  className={`font-mono ${codeError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                  onKeyDown={e => e.key === 'Enter' && handleRename()}
                />
              </div>
              {codeError && (
                <p className="text-xs text-destructive">{codeError}</p>
              )}
            </div>

            {/* Impacto */}
            <Alert className={totalAffected > 0 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' : ''}>
              <AlertTriangle className={`h-4 w-4 ${totalAffected > 0 ? 'text-amber-600' : 'text-muted-foreground'}`} />
              <AlertDescription>
                {loadingImpact ? (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Calculando impacto…
                  </span>
                ) : impact ? (
                  <div className="text-sm space-y-1">
                    {totalAffected === 0 ? (
                      <p className="text-muted-foreground">Esta cuenta no tiene registros asociados. El rename es inmediato.</p>
                    ) : (
                      <>
                        <p className="font-medium text-amber-700 dark:text-amber-400">
                          Se actualizarán {totalAffected} registro{totalAffected !== 1 ? 's' : ''} en la base de datos:
                        </p>
                        <ul className="text-muted-foreground space-y-0.5 pl-1">
                          {impact.journal_lines > 0 && (
                            <li>· <strong>{impact.journal_lines}</strong> línea{impact.journal_lines !== 1 ? 's' : ''} del Libro Diario</li>
                          )}
                          {impact.aux_ledger > 0 && (
                            <li>· <strong>{impact.aux_ledger}</strong> registro{impact.aux_ledger !== 1 ? 's' : ''} de Libro Auxiliar</li>
                          )}
                          {impact.aux_def > 0 && (
                            <li>· <strong>{impact.aux_def}</strong> definición{impact.aux_def !== 1 ? 'es' : ''} de Auxiliar</li>
                          )}
                          {impact.sale_config > 0 && (
                            <li>· <strong>{impact.sale_config}</strong> config de Cuentas de Venta</li>
                          )}
                        </ul>
                        <p className="text-xs text-muted-foreground pt-1">
                          La operación es atómica — si algo falla, se revierte todo.
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleRename}
            disabled={!canSave}
            className={totalAffected > 0 ? 'bg-amber-600 hover:bg-amber-700 text-white border-0' : ''}
          >
            {saving
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Renombrando…</>
              : `Renombrar${totalAffected > 0 ? ` (${totalAffected} registros)` : ''}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
