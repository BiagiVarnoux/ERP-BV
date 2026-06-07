import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from './AuthProvider';
import { toast } from 'sonner';
import { z } from 'zod';
import { Check, X } from 'lucide-react';

// ─── Password rules ───────────────────────────────────────────────────────────

const PASSWORD_RULES = [
  { id: 'length',    label: 'Al menos 8 caracteres',         test: (p: string) => p.length >= 8 },
  { id: 'upper',     label: 'Una letra mayúscula (A-Z)',      test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower',     label: 'Una letra minúscula (a-z)',      test: (p: string) => /[a-z]/.test(p) },
  { id: 'number',    label: 'Un número (0-9)',                test: (p: string) => /\d/.test(p) },
  { id: 'special',   label: 'Un carácter especial (!@#$…)',   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'Contraseña demasiado larga')
  .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
  .regex(/\d/,    'Debe incluir al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un carácter especial');

const authSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: 'Email inválido' })
    .max(255, { message: 'Email demasiado largo' }),
  password: z.string(), // detailed validation below for sign-up
  invitationCode: z.string().trim().optional(),
});

// ─── Password strength indicator ─────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  const results = useMemo(() => PASSWORD_RULES.map(r => ({ ...r, passed: r.test(password) })), [password]);
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

export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const base = authSchema.safeParse({
        email: email.trim(),
        password,
        invitationCode: invitationCode.trim(),
      });

      if (!base.success) {
        toast.error(base.error.errors[0].message);
        setLoading(false);
        return;
      }

      // Extra password complexity check only on sign-up
      if (!isLogin) {
        const pwResult = passwordSchema.safeParse(password);
        if (!pwResult.success) {
          toast.error(pwResult.error.errors[0].message);
          setLoading(false);
          return;
        }
      }

      const { email: validEmail, password: validPassword, invitationCode: validCode } = base.data;

      if (isLogin) {
        await signIn(validEmail, validPassword);
        toast.success('¡Sesión iniciada exitosamente!');
      } else {
        await signUp(validEmail, validPassword, validCode);
        if (validCode) {
          toast.success('¡Cuenta creada! Confirma tu email para aplicar el código de invitación.');
        } else {
          toast.success('¡Cuenta creada exitosamente! Revisa tu email para confirmar.');
        }
      }
    } catch {
      toast.error('Error en la autenticación. Por favor verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? 'Ingresa a tu sistema de contabilidad'
              : 'Crea una nueva cuenta para empezar'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="tu@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={8}
              />
              {/* Show strength indicator only on sign-up */}
              {!isLogin && <PasswordStrength password={password} />}
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="invitationCode">Código de Invitación (opcional)</Label>
                <Input
                  id="invitationCode"
                  type="text"
                  value={invitationCode}
                  onChange={e => setInvitationCode(e.target.value)}
                  placeholder="Ingresa tu código de invitación"
                />
                <p className="text-xs text-muted-foreground">
                  Si tienes un código de invitación, ingrésalo aquí. Si no, se creará una cuenta principal.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Procesando...' : (isLogin ? 'Iniciar Sesión' : 'Crear Cuenta')}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Button
              variant="link"
              onClick={() => { setIsLogin(!isLogin); setPassword(''); }}
              className="text-sm"
            >
              {isLogin
                ? '¿No tienes cuenta? Créala aquí'
                : '¿Ya tienes cuenta? Inicia sesión'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
