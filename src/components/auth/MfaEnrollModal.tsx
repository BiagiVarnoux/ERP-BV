// MFA Enrollment modal — owners can set up TOTP authenticator app
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShieldCheck, Copy } from 'lucide-react';

interface MfaEnrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

export function MfaEnrollModal({ isOpen, onClose, onEnrolled }: MfaEnrollModalProps) {
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [factorId, setFactorId] = useState<string>('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'qr' | 'verify'>('qr');

  useEffect(() => {
    if (!isOpen) return;
    setCode('');
    setStep('qr');
    initEnroll();
  }, [isOpen]);

  async function initEnroll() {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'ERP BV Authenticator',
      });
      if (error) throw error;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (e: any) {
      toast.error(e.message || 'Error al generar código QR');
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (code.length !== 6) { toast.error('Ingresa el código de 6 dígitos'); return; }
    setLoading(true);
    try {
      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      if (verifyErr) throw verifyErr;

      toast.success('¡Autenticación de dos factores activada!');
      onEnrolled();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Código incorrecto. Intenta de nuevo.');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret);
    toast.success('Clave copiada al portapapeles');
  }

  return (
    <Dialog open={isOpen} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            <DialogTitle>Configurar autenticación de dos factores (2FA)</DialogTitle>
          </div>
          <DialogDescription>
            Agrega una capa extra de seguridad a tu cuenta de propietario.
          </DialogDescription>
        </DialogHeader>

        {step === 'qr' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escanea este código QR con tu aplicación de autenticación (Google Authenticator, Authy, etc.).
            </p>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="text-sm text-muted-foreground">Generando código QR...</div>
              </div>
            ) : qrCode ? (
              <div className="flex flex-col items-center gap-3">
                <img src={qrCode} alt="QR Code MFA" className="w-48 h-48 border rounded" />
                <div className="w-full">
                  <Label className="text-xs text-muted-foreground">O ingresa la clave manualmente:</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 text-xs bg-muted px-2 py-1 rounded break-all">{secret}</code>
                    <Button variant="ghost" size="sm" onClick={copySecret}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => setStep('verify')} disabled={!qrCode || loading}>
                Ya escaneé el código →
              </Button>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ingresa el código de 6 dígitos que muestra tu aplicación para confirmar la configuración.
            </p>
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Código de verificación</Label>
              <Input
                id="mfa-code"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                autoFocus
                className="text-center text-2xl tracking-widest"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('qr')}>← Volver</Button>
              <Button onClick={handleVerify} disabled={loading || code.length !== 6}>
                {loading ? 'Verificando...' : 'Activar 2FA'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
