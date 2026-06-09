import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileText, Calculator, BookOpen, BarChart3, ClipboardList, KeyRound } from 'lucide-react';

export default function ViewerDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isViewer, isOwner, permissions, loading } = useUserAccess();
  const [invitationCode, setInvitationCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    // If user is owner, redirect to accounts
    if (!loading && isOwner) {
      navigate('/accounts');
    }
  }, [isOwner, loading, navigate]);

  const handleRedeemCode = async () => {
    if (!invitationCode.trim() || !user) return;
    
    setRedeeming(true);
    try {
      const { data, error } = await supabase.rpc('redeem_invitation_code', {
        _code: invitationCode.trim(),
        _user_id: user.id
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; permissions?: any };
      
      if (!result.success) {
        toast.error(result.error || 'Error al canjear código');
        return;
      }

      toast.success('Código canjeado exitosamente. Ahora tienes acceso a la contabilidad compartida.');
      setInvitationCode('');
      
      // Limpiar cualquier código pendiente en localStorage
      localStorage.removeItem('pending_invitation_code');
      
      // Reload the page to refresh access
      window.location.reload();
    } catch (error: any) {
      toast.error(error.message || 'Error al canjear código');
    } finally {
      setRedeeming(false);
    }
  };

  const navigateToSection = (path: string) => {
    navigate(path);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  // Show redeem code form for users without role yet (no company membership)
  if (!isViewer && !isOwner) {
    return (
      <div className="max-w-md mx-auto mt-12 space-y-6">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Código de Invitación</CardTitle>
            <CardDescription>
              Si tienes un código de invitación, ingrésalo aquí para acceder a una contabilidad compartida
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value)}
                placeholder="Ingresa el código"
              />
            </div>
            <Button 
              onClick={handleRedeemCode} 
              disabled={!invitationCode.trim() || redeeming}
              className="w-full"
            >
              {redeeming ? 'Procesando...' : 'Canjear Código'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Viewer with access - show dashboard
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Panel de Visualización</h1>
        <p className="text-muted-foreground mt-2">
          Tienes acceso de solo lectura a la contabilidad compartida
        </p>
      </div>

      {/* Available sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {permissions.can_view_accounts && (
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigateToSection('/accounts')}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <ClipboardList className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Plan de Cuentas</CardTitle>
                  <CardDescription>Ver cuentas contables</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {permissions.can_view_journal && (
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigateToSection('/journal')}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <BookOpen className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Libro Diario</CardTitle>
                  <CardDescription>Ver asientos contables</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {permissions.can_view_auxiliary && (
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigateToSection('/auxiliary-ledgers')}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Libros Auxiliares</CardTitle>
                  <CardDescription>Ver libros auxiliares y Kárdex</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {permissions.can_view_ledger && (
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigateToSection('/ledger')}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                  <Calculator className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Libro Mayor</CardTitle>
                  <CardDescription>Ver libro mayor</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {permissions.can_view_reports && (
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigateToSection('/reports')}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Reportes</CardTitle>
                  <CardDescription>Ver reportes financieros</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}
      </div>

      {/* Permissions badge list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tus Permisos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {permissions.can_view_accounts && <Badge variant="secondary">Plan de Cuentas</Badge>}
            {permissions.can_view_journal && <Badge variant="secondary">Libro Diario</Badge>}
            {permissions.can_view_auxiliary && <Badge variant="secondary">Libros Auxiliares</Badge>}
            {permissions.can_view_ledger && <Badge variant="secondary">Libro Mayor</Badge>}
            {permissions.can_view_reports && <Badge variant="secondary">Reportes</Badge>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
