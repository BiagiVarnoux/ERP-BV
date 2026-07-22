import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserAccess } from '@/contexts/UserAccessContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Copy, Loader2, UserPlus } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type CompanyRole = Database['public']['Enums']['company_role'];

const ROLE_OPTIONS: { value: CompanyRole; label: string; description: string }[] = [
  { value: 'manager',    label: 'Gerente',    description: 'Acceso completo excepto configuración' },
  { value: 'accountant', label: 'Contador',   description: 'Módulos contables + lectura inventario/ventas' },
  { value: 'auditor',    label: 'Auditor',    description: 'Solo lectura en todos los módulos' },
  { value: 'viewer',     label: 'Lector',     description: 'Solo lectura en módulos contables' },
  { value: 'custom',     label: 'Personalizado', description: 'Sin permisos iniciales — configurar manualmente' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (code: string) => void;
}

export function InviteUserModal({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const { companyId } = useUserAccess();
  const [role, setRole] = useState<CompanyRole>('viewer');
  const [expirationDays, setExpirationDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_invitation_code', {
        p_company_id:   companyId,
        p_role:         role,
        p_expires_days: expirationDays,
      });
      if (error) throw error;
      setGeneratedCode(data as string);
      onCreated(data as string);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    toast({ title: 'Copiado', description: 'Código copiado al portapapeles.' });
  };

  const handleClose = () => {
    setGeneratedCode(null);
    setRole('viewer');
    setExpirationDays(7);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invitar Usuario
          </DialogTitle>
        </DialogHeader>

        {generatedCode ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Comparte este código con el usuario. Expira en <strong>{expirationDays} días</strong>.
            </p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg font-mono text-sm break-all">
              <span className="flex-1">{generatedCode}</span>
              <Button variant="ghost" size="icon" onClick={copyCode} className="shrink-0">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              El usuario deberá ingresar este código al registrarse para acceder al sistema con el rol de{' '}
              <strong>{ROLE_OPTIONS.find(r => r.value === role)?.label}</strong>.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rol del nuevo usuario</Label>
              <Select value={role} onValueChange={v => setRole(v as CompanyRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <div>
                        <div className="font-medium">{r.label}</div>
                        <div className="text-xs text-muted-foreground">{r.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry">Días de vigencia del código</Label>
              <Input
                id="expiry"
                type="number"
                min={1}
                max={90}
                value={expirationDays}
                onChange={e => setExpirationDays(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {generatedCode ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!generatedCode && (
            <Button onClick={handleGenerate} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generar código
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
