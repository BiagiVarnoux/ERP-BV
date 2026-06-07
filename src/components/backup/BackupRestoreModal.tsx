// src/components/backup/BackupRestoreModal.tsx
import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, Upload, Loader2, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  createFullBackup,
  downloadBackup,
  restoreFromBackup,
  validateBackupFile,
  verifyBackupIntegrity,
  BackupData
} from '@/services/backupService';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreComplete: () => void;
}

export function BackupRestoreModal({ isOpen, onClose, onRestoreComplete }: BackupRestoreModalProps) {
  const [loading, setLoading] = useState(false);
  const [restoreData, setRestoreData] = useState<BackupData | null>(null);
  const [restoreStep, setRestoreStep] = useState<'select' | 'confirm' | 'restoring'>('select');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleBackup() {
    setLoading(true);
    try {
      const data = await createFullBackup();
      await downloadBackup(data);
      toast.success('Backup descargado y firmado correctamente');
    } catch (error: any) {
      toast.error(error.message || 'Error creando backup');
    } finally {
      setLoading(false);
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);

        // Step 1: structural validation
        const validation = validateBackupFile(data);
        if (!validation.valid) {
          toast.error(validation.error || 'Archivo inválido');
          return;
        }

        // Step 2: HMAC integrity check
        const integrity = await verifyBackupIntegrity(data);
        if (!integrity.valid) {
          toast.error(integrity.error || 'Firma de integridad inválida');
          return;
        }
        if (integrity.error) {
          // Warning for old backups without signature
          toast.warning(integrity.error);
        }

        setRestoreData(data as BackupData);
        setRestoreStep('confirm');
      } catch (error) {
        toast.error('Error leyendo archivo JSON');
      }
    };
    reader.readAsText(file);
  }

  async function handleRestore() {
    if (!restoreData) return;

    setRestoreStep('restoring');
    setLoading(true);

    try {
      const result = await restoreFromBackup(restoreData);
      
      if (result.success) {
        toast.success(result.message);
        onRestoreComplete();
        handleClose();
      } else {
        toast.error(result.message);
        setRestoreStep('confirm');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error en restauración');
      setRestoreStep('confirm');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setRestoreData(null);
    setRestoreStep('select');
    onClose();
  }

  function formatBackupStats(data: BackupData): React.ReactNode {
    return (
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>Cuentas: <strong>{data.accounts.length}</strong></div>
        <div>Asientos: <strong>{data.journal_entries.length}</strong></div>
        <div>Líneas: <strong>{data.journal_lines.length}</strong></div>
        <div>Aux. Definiciones: <strong>{data.auxiliary_ledger_definitions?.length || 0}</strong></div>
        <div>Aux. Ledger: <strong>{data.auxiliary_ledger?.length || 0}</strong></div>
        <div>Aux. Movimientos: <strong>{data.auxiliary_movement_details?.length || 0}</strong></div>
        <div>Kardex Defs: <strong>{data.kardex_definitions?.length || 0}</strong></div>
        <div>Kardex Entries: <strong>{data.kardex_entries?.length || 0}</strong></div>
        <div>Kardex Movs: <strong>{data.kardex_movements?.length || 0}</strong></div>
        <div>Cierres Trim: <strong>{data.quarterly_closures?.length || 0}</strong></div>
        <div>Productos: <strong>{data.products?.length || 0}</strong></div>
        <div>Mov. Inventario: <strong>{data.inventory_movements?.length || 0}</strong></div>
        <div>Lotes Inventario: <strong>{data.inventory_lots?.length || 0}</strong></div>
        <div>Lotes Importación: <strong>{data.import_lots?.length || 0}</strong></div>
        <div>Hojas de Costo: <strong>{data.cost_sheets?.length || 0}</strong></div>
        <div>Celdas H. Costo: <strong>{data.cost_sheet_cells?.length || 0}</strong></div>
        <div>Config. Reportes: <strong>{data.report_settings?.length || 0}</strong></div>
        <div>Embarques: <strong>{data.shipments?.length || 0}</strong></div>
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backup y Restauración</DialogTitle>
          <DialogDescription>
            Descarga un respaldo completo de tu contabilidad o restaura desde un archivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Backup section */}
          <div className="p-4 border rounded-lg space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <Download className="w-4 h-4" />
              Crear Backup
            </h3>
            <p className="text-sm text-muted-foreground">
              Descarga un archivo JSON con todos tus datos: cuentas, asientos, auxiliares, kardex, inventario, embarques y más.
            </p>
            <Button onClick={handleBackup} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Descargar Backup
            </Button>
          </div>

          {/* Restore section */}
          <div className="p-4 border rounded-lg space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Restaurar Backup
            </h3>
            
            {restoreStep === 'select' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Selecciona un archivo de backup para restaurar. Esto reemplazará todos los datos actuales.
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Seleccionar Archivo
                </Button>
              </>
            )}

            {restoreStep === 'confirm' && restoreData && (
              <>
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>¡Advertencia!</AlertTitle>
                  <AlertDescription>
                    Esta acción eliminará TODOS tus datos actuales y los reemplazará con los del backup.
                    Esta acción no se puede deshacer.
                  </AlertDescription>
                </Alert>

                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">
                    Backup del: {new Date(restoreData.created_at).toLocaleString('es')}
                  </p>
                  {formatBackupStats(restoreData)}
                </div>

                <div className="flex gap-2">
                  <Button variant="destructive" onClick={handleRestore} disabled={loading}>
                    {loading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Confirmar Restauración
                  </Button>
                  <Button variant="outline" onClick={() => setRestoreStep('select')}>
                    Cancelar
                  </Button>
                </div>
              </>
            )}

            {restoreStep === 'restoring' && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>Restaurando datos...</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
