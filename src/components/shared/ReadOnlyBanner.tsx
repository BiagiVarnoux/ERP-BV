import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye } from 'lucide-react';
import { useUserAccess } from '@/contexts/UserAccessContext';

export function ReadOnlyBanner() {
  const { isReadOnly } = useUserAccess();

  if (!isReadOnly) return null;

  return (
    <Alert className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
      <Eye className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-800 dark:text-amber-200">
        <span className="font-medium">Modo de solo lectura</span> — Estás viendo la contabilidad compartida. No puedes crear, editar ni eliminar registros.
      </AlertDescription>
    </Alert>
  );
}
