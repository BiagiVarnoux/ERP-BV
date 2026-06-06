import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from './AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';

const authSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: 'Email inválido' })
    .max(255, { message: 'Email demasiado largo' }),
  password: z
    .string()
    .min(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
    .max(72, { message: 'Contraseña demasiado larga' }),
  invitationCode: z.string().trim().optional(),
});

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
      // Validate inputs
      const validationResult = authSchema.safeParse({
        email: email.trim(),
        password,
        invitationCode: invitationCode.trim(),
      });

      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        toast.error(firstError.message);
        setLoading(false);
        return;
      }

      const validatedData = validationResult.data;

      if (isLogin) {
        await signIn(validatedData.email, validatedData.password);
        toast.success('¡Sesión iniciada exitosamente!');
      } else {
        // El código viaja en el emailRedirectTo — no se guarda en localStorage
        await signUp(validatedData.email, validatedData.password, validatedData.invitationCode);

        if (validatedData.invitationCode) {
          toast.success('¡Cuenta creada! Confirma tu email para aplicar el código de invitación.');
        } else {
          toast.success('¡Cuenta creada exitosamente! Revisa tu email para confirmar.');
        }
      }
    } catch (error: any) {
      // Sanitized error message - don't expose internal details
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
              : 'Crea una nueva cuenta para empezar'
            }
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
                onChange={(e) => setEmail(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={8}
              />
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="invitationCode">Código de Invitación (opcional)</Label>
                <Input
                  id="invitationCode"
                  type="text"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value)}
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
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm"
            >
              {isLogin 
                ? '¿No tienes cuenta? Créala aquí' 
                : '¿Ya tienes cuenta? Inicia sesión'
              }
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}