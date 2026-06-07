// src/components/audit/AuditLogModal.tsx
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { getAuditLog, AuditLogEntry, formatAuditAction, formatTableName } from '@/services/auditService';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordId?: string;
  tableName?: string;
}

export function AuditLogModal({ isOpen, onClose, recordId, tableName }: AuditLogModalProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, recordId, tableName]);

  async function loadLogs() {
    setLoading(true);
    try {
      const data = await getAuditLog(tableName, recordId, 50);
      setLogs(data);
    } catch (error) {
      console.error('Error loading audit logs:', error);
    } finally {
      setLoading(false);
    }
  }

  function getActionBadgeVariant(action: string) {
    switch (action) {
      case 'INSERT': return 'default';
      case 'UPDATE': return 'secondary';
      case 'DELETE': return 'destructive';
      default: return 'outline';
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('es', {
      timeZone: 'America/La_Paz',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatChangedFields(entry: AuditLogEntry): string {
    if (!entry.changed_fields || entry.changed_fields.length === 0) {
      return '—';
    }
    return entry.changed_fields.join(', ');
  }

  function formatOldNewValue(entry: AuditLogEntry): React.ReactNode {
    if (entry.action === 'INSERT') {
      return <span className="text-xs text-muted-foreground">Registro creado</span>;
    }
    
    if (entry.action === 'DELETE') {
      return <span className="text-xs text-muted-foreground">Registro eliminado</span>;
    }

    if (!entry.changed_fields || entry.changed_fields.length === 0) {
      return <span className="text-xs text-muted-foreground">Sin cambios</span>;
    }

    return (
      <div className="space-y-1">
        {entry.changed_fields.map(field => {
          const oldVal = entry.old_values?.[field];
          const newVal = entry.new_values?.[field];
          return (
            <div key={field} className="text-xs">
              <span className="font-medium">{field}:</span>{' '}
              <span className="text-red-500 line-through">{JSON.stringify(oldVal)}</span>{' → '}
              <span className="text-green-600">{JSON.stringify(newVal)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            Historial de Cambios
            {recordId && <span className="text-muted-foreground ml-2">({recordId})</span>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay registros de auditoría
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Fecha</TableHead>
                  <TableHead className="w-[100px]">Acción</TableHead>
                  <TableHead className="w-[100px]">Tabla</TableHead>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Cambios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{formatDate(log.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={getActionBadgeVariant(log.action)}>
                        {formatAuditAction(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatTableName(log.table_name)}</TableCell>
                    <TableCell className="font-mono text-xs">{log.record_id}</TableCell>
                    <TableCell>{formatOldNewValue(log)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
