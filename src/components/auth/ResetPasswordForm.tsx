import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, X, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthProvider';

// ─── Password rules (same as AuthForm) ───────────────────────────────────────

const PASSWORD_RULES = [
  { id: 'length',  label: 'Al menos 8 caracteres',       test: (p: string) => p.length >= 8 },
  { id: 'upper',   label: 'Una letra mayúscula (A-Z)',    test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'Una letra minúscula (a-z)',    test: (p: string) => /[a-z]/.test(p) },
  { id: 'number',  label: 'Un número (0-9)',              test: (p: string) => /\d/.test(p) },
  { id: 'special', label: 'Un carácter especial (!@#$…)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'Contraseña demasiado larga')
  .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
  .regex(/\d/,    'Debe incluir al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un carácter especial');

function PasswordStrength({ password }: { password: string }) {
  const results = useMemo(
    () => PASSWORD_RULES.map(r => ({ ...r, passed: r.test(password) })),
    [password],
  );
  if (!password) return null;
  return (
    <ul className="mt-2 space-y-1">
      {results.map(r => (
        <li key={r.id} className="flex items-center gap-1.5 text-xs">
          {r.passed
            ? <Check className="h-3 w-3 text-green-600 shrink-0" />
            : <X    className="h-3 w-3 text-red-500 shrink-0" />}
          <span className={r.passed ? 'text-green-700' : 'text-muted-foreground'}>{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ResetPasswordForm() {
  const { clearPasswordRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate complexity
      const pwResult = passwordSchema.safeParse(password);
      if (!pwResult.success) {
        toast.error(pwResult.error.errors[0].message);
        return;
      }

      if (password !== confirm) {
        toast.error('Las contraseñas no coinciden.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success('¡Contraseña actualizada correctamente! Ya puedes iniciar sesión.');
      // Sign out so the user does a clean login with the new password
      clearPasswordRecovery();
      await signOut();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/same password/i.test(msg)) {
        toast.error('La nueva contraseña no puede ser igual a la anterior.');
      } else {
        toast.error(`Error al actualizar contraseña: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Restablecer contraseña</CardTitle>
          <CardDescription>
            Ingresa tu nueva contraseña. Debe cumplir los requisitos de seguridad.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={8}
                autoFocus
              />
              <PasswordStrength password={password} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="••••••••"
                minLength={8}
              />
              {confirm && password !== confirm && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <X className="h-3 w-3" /> Las contraseñas no coinciden
                </p>
              )}
              {confirm && password === confirm && confirm.length > 0 && (
                <p className="text-xs text-green-700 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Las contraseñas coinciden
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || password !== confirm || password.length < 8}
            >
              {loading ? 'Guardando...' : 'Establecer nueva contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
