// MFA Verification modal — shown after login if owner has TOTP enrolled
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';

interface MfaVerifyModalProps {
  isOpen: boolean;
  onVerified: () => void;
  onSignOut: () => void;
}

export function MfaVerifyModal({ isOpen, onVerified, onSignOut }: MfaVerifyModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) setCode('');
  }, [isOpen]);

  async function handleVerify() {
    if (code.length !== 6) { toast.error('Ingresa el código de 6 dígitos'); return; }
    setLoading(true);
    try {
      const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
      if (factorsErr) throw factorsErr;

      const totpFactor = factorsData.totp.find(f => f.status === 'verified');
      if (!totpFactor) throw new Error('No se encontró un factor TOTP activo');

      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code,
      });
      if (verifyErr) throw verifyErr;

      onVerified();
    } catch (e: any) {
      toast.error(e.message || 'Código incorrecto. Intenta de nuevo.');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-sm" onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            <DialogTitle>Verificación de dos factores</DialogTitle>
          </div>
          <DialogDescription>
            Ingresa el código de tu aplicación de autenticación para continuar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-verify-code">Código de verificación</Label>
            <Input
              id="mfa-verify-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              autoFocus
              className="text-center text-2xl tracking-widest"
            />
          </div>

          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={onSignOut} disabled={loading}>
              Cerrar sesión
            </Button>
            <Button onClick={handleVerify} disabled={loading || code.length !== 6} className="flex-1">
              {loading ? 'Verificando...' : 'Verificar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
