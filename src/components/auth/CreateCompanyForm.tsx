import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { useAuth } from './AuthProvider';

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export function CreateCompanyForm() {
  const { signOut } = useAuth();
  const { refreshAccess } = useUserAccess();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const slug = toSlug(trimmed);
      const { data, error } = await supabase.rpc('create_my_company', {
        p_name: trimmed,
        p_slug: slug,
        p_country: 'BO',
        p_currency: 'BOB',
      });

      if (error) throw error;
      const result = data as { success: boolean; company_id?: string } | null;
      if (!result?.success) throw new Error('No se pudo crear la empresa');

      toast.success(`Empresa "${trimmed}" creada exitosamente`);
      refreshAccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ya pertenece')) {
        toast.error('Tu cuenta ya está vinculada a una empresa. Recarga la página.');
        refreshAccess();
      } else if (msg.includes('duplicate') || msg.includes('unique')) {
        toast.error('Ya existe una empresa con ese nombre. Prueba con otro.');
      } else {
        toast.error(`Error: ${msg}`);
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
            <Building2 className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Crea tu empresa</CardTitle>
          <CardDescription>
            Ingresa el nombre de tu empresa para comenzar a usar el sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Nombre de la empresa</Label>
              <Input
                id="company-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ej. Mi Empresa S.R.L."
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
              {loading ? 'Creando empresa...' : 'Crear empresa'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Button variant="link" className="text-xs text-muted-foreground" onClick={() => signOut()}>
              Cerrar sesión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
