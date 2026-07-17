import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useUserAccess, useActiveCompanyId } from '@/contexts/UserAccessContext';
import { Copy, Plus, Trash2, Database, History, LayoutGrid, ShieldCheck, Tag, Pencil, Check, X, BookOpen } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModuleConfigTab } from '@/components/settings/ModuleConfigTab';
import { SaleAccountsConfigTab } from '@/components/settings/SaleAccountsConfigTab';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BackupRestoreModal } from '@/components/backup/BackupRestoreModal';
import { AuditLogModal } from '@/components/audit/AuditLogModal';
import { MfaEnrollModal } from '@/components/auth/MfaEnrollModal';


interface InvitationCode {
  id: string;
  code: string;
  can_view_accounts: boolean;
  can_view_journal: boolean;
  can_view_auxiliary: boolean;
  can_view_ledger: boolean;
  can_view_reports: boolean;
  used: boolean;
  used_by: string | null;
  expires_at: string;
  created_at: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { setAccounts, setEntries, adapter } = useAccounting();
  const { toast } = useToast();
  const { isOwner, loading } = useUserAccess();
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([]);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaEnrolled, setMfaEnrolled] = useState(false);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (data?.totp?.some(f => f.status === 'verified')) setMfaEnrolled(true);
    });
  }, []);
  
  // Form states
  const [permissions, setPermissions] = useState({
    can_view_accounts: true,
    can_view_journal: true,
    can_view_auxiliary: true,
    can_view_ledger: true,
    can_view_reports: true,
  });
  const [expirationDays, setExpirationDays] = useState(7);

  useEffect(() => {
    fetchInvitationCodes();
  }, [user]);

  const fetchInvitationCodes = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('invitation_codes')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvitationCodes(data || []);
    } catch (error) {
      // Failed to fetch invitation codes
    }
  };

  const generateInvitationCode = async () => {
    if (!user || !isOwner) return;

    try {
      const code = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      const { error } = await supabase
        .from('invitation_codes')
        .insert({
          code,
          owner_id: user.id,
          expires_at: expiresAt.toISOString(),
          ...permissions,
        });

      if (error) throw error;

      toast({
        title: 'Código generado',
        description: 'El código de invitación ha sido creado exitosamente.',
      });

      fetchInvitationCodes();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const deleteInvitationCode = async (id: string) => {
    try {
      const { error } = await supabase
        .from('invitation_codes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Código eliminado',
        description: 'El código de invitación ha sido eliminado.',
      });

      fetchInvitationCodes();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: 'Copiado',
      description: 'El código ha sido copiado al portapapeles.',
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Cargando...</div>;
  }

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Acceso Restringido</CardTitle>
            <CardDescription>
              Solo los usuarios principales pueden acceder a esta sección.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  async function handleRestoreComplete() {
    // Reload all data after restore
    const accounts = await adapter.loadAccounts();
    const entries = await adapter.loadEntries();
    setAccounts(accounts);
    setEntries(entries);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">Gestiona el acceso de usuarios, módulos y respaldos</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-4">
          <TabsTrigger value="general">
            <Database className="h-4 w-4 mr-1.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="modules">
            <LayoutGrid className="h-4 w-4 mr-1.5" />
            Módulos
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tag className="h-4 w-4 mr-1.5" />
            Categorías
          </TabsTrigger>
          <TabsTrigger value="cuentas_venta">
            <BookOpen className="h-4 w-4 mr-1.5" />
            Cuentas de Venta
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Módulos ── */}
        <TabsContent value="modules">
          <ModuleConfigTab />
        </TabsContent>

        {/* ── Tab: Cuentas de Venta ── */}
        <TabsContent value="cuentas_venta" className="mt-2">
          <SaleAccountsConfigTab />
        </TabsContent>

        {/* ── Tab: General (contenido existente) ── */}
        <TabsContent value="general" className="space-y-6">

      {/* Backup & Audit Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Backup y Restauración
            </CardTitle>
            <CardDescription>
              Respalda o restaura todos tus datos contables
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setBackupModalOpen(true)} className="w-full">
              <Database className="h-4 w-4 mr-2" />
              Abrir Gestión de Backup
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial de Cambios
            </CardTitle>
            <CardDescription>
              Revisa el historial de modificaciones en tu contabilidad
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setAuditModalOpen(true)} variant="outline" className="w-full">
              <History className="h-4 w-4 mr-2" />
              Ver Historial de Auditoría
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Seguridad — 2FA */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Autenticación de dos factores (2FA)
            </CardTitle>
            <CardDescription>
              Protege tu cuenta de propietario con un segundo factor de autenticación (TOTP).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {mfaEnrolled ? (
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-700 font-medium">2FA activado en tu cuenta</span>
              </div>
            ) : (
              <Button onClick={() => setMfaModalOpen(true)} variant="outline" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                Activar autenticación de dos factores
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Generate Invitation Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Generar Código de Invitación
          </CardTitle>
          <CardDescription>
            Crea códigos para invitar a otros usuarios con permisos de solo lectura
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiration">Días de expiración</Label>
              <Input
                id="expiration"
                type="number"
                min="1"
                value={expirationDays}
                onChange={(e) => setExpirationDays(parseInt(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Permisos</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="accounts" className="font-normal">Plan de Cuentas</Label>
                <Switch
                  id="accounts"
                  checked={permissions.can_view_accounts}
                  onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_accounts: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="journal" className="font-normal">Libro Diario</Label>
                <Switch
                  id="journal"
                  checked={permissions.can_view_journal}
                  onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_journal: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="auxiliary" className="font-normal">Libros Auxiliares</Label>
                <Switch
                  id="auxiliary"
                  checked={permissions.can_view_auxiliary}
                  onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_auxiliary: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="ledger" className="font-normal">Libro Mayor</Label>
                <Switch
                  id="ledger"
                  checked={permissions.can_view_ledger}
                  onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_ledger: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="reports" className="font-normal">Reportes</Label>
                <Switch
                  id="reports"
                  checked={permissions.can_view_reports}
                  onCheckedChange={(checked) => setPermissions({ ...permissions, can_view_reports: checked })}
                />
              </div>
            </div>
          </div>

          <Button onClick={generateInvitationCode} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Generar Código
          </Button>
        </CardContent>
      </Card>

      {/* Invitation Codes List */}
      <Card>
        <CardHeader>
          <CardTitle>Códigos de Invitación</CardTitle>
          <CardDescription>Códigos generados para compartir acceso</CardDescription>
        </CardHeader>
        <CardContent>
          {invitationCodes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No hay códigos de invitación generados
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitationCodes.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell className="font-mono text-sm">{code.code}</TableCell>
                    <TableCell>
                      <Badge variant={code.used ? "secondary" : "default"}>
                        {code.used ? 'Usado' : 'Activo'}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(code.expires_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {code.can_view_accounts && <Badge variant="outline" className="text-xs">Cuentas</Badge>}
                        {code.can_view_journal && <Badge variant="outline" className="text-xs">Diario</Badge>}
                        {code.can_view_auxiliary && <Badge variant="outline" className="text-xs">Auxiliar</Badge>}
                        {code.can_view_ledger && <Badge variant="outline" className="text-xs">Mayor</Badge>}
                        {code.can_view_reports && <Badge variant="outline" className="text-xs">Reportes</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(code.code)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteInvitationCode(code.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* La gestión detallada de miembros se hace desde /users */}

      <BackupRestoreModal
        isOpen={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
        onRestoreComplete={handleRestoreComplete}
      />

      <AuditLogModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />

      <MfaEnrollModal
        isOpen={mfaModalOpen}
        onClose={() => setMfaModalOpen(false)}
        onEnrolled={() => setMfaEnrolled(true)}
      />

        </TabsContent>{/* cierre TabsContent general */}

        {/* ── Tab: Categorías de Inventario ── */}
        <TabsContent value="categories" className="space-y-6">
          <ProductCategoriesTab />
          <ProductTiposTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Pestaña de categorías de inventario ──────────────────────────────────────

interface ProductCategoryRow {
  id: string;
  nombre: string;
  codigo: string;
}

function ProductCategoriesTab() {
  const { isOwner } = useUserAccess();
  const companyId = useActiveCompanyId();
  const [cats, setCats] = useState<ProductCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNombre, setNewNombre] = useState('');
  const [newCodigo, setNewCodigo] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast: showToast } = useToast();

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('product_categories')
      .select('id, nombre, codigo')
      .eq('company_id', companyId)
      .order('nombre');
    setCats((data ?? []) as ProductCategoryRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId]);

  async function handleAdd() {
    if (!newNombre.trim() || newCodigo.trim().length !== 3) {
      showToast({ title: 'El nombre es requerido y el código debe tener exactamente 3 letras', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('product_categories').insert({
      company_id: companyId,
      nombre: newNombre.trim(),
      codigo: newCodigo.trim().toUpperCase(),
    });
    setSaving(false);
    if (error) { showToast({ title: error.message, variant: 'destructive' }); return; }
    setNewNombre(''); setNewCodigo('');
    load();
  }

  async function handleUpdate(id: string) {
    if (!editNombre.trim() || editCodigo.trim().length !== 3) {
      showToast({ title: 'Nombre requerido y código de 3 letras', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('product_categories')
      .update({ nombre: editNombre.trim(), codigo: editCodigo.trim().toUpperCase() })
      .eq('id', id).eq('company_id', companyId);
    if (error) { showToast({ title: error.message, variant: 'destructive' }); return; }
    setEditId(null);
    load();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from('product_categories')
      .delete().eq('id', id).eq('company_id', companyId);
    setDeletingId(null);
    if (error) { showToast({ title: error.message, variant: 'destructive' }); return; }
    load();
  }

  if (!isOwner) {
    return <p className="text-sm text-muted-foreground">Solo el dueño puede gestionar las categorías de inventario.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Categorías de Inventario
          </CardTitle>
          <CardDescription>
            Define las categorías que aparecerán en el SKU de tus productos.
            Cada código debe ser exactamente 3 letras (ej: CEL, TAB, LAP).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add row */}
          <div className="flex gap-2 items-end">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                placeholder="Celulares"
                value={newNombre}
                onChange={e => setNewNombre(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              />
            </div>
            <div className="space-y-1 w-24">
              <Label className="text-xs">Código (3)</Label>
              <Input
                placeholder="CEL"
                maxLength={3}
                value={newCodigo}
                onChange={e => setNewCodigo(e.target.value.toUpperCase())}
                className="font-mono uppercase"
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              />
            </div>
            <Button onClick={handleAdd} disabled={saving} className="shrink-0">
              <Plus className="h-4 w-4 mr-1" />
              Agregar
            </Button>
          </div>

          {/* List */}
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : cats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay categorías. Agrega la primera arriba.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cats.map(cat => (
                  <TableRow key={cat.id}>
                    {editId === cat.id ? (
                      <>
                        <TableCell>
                          <Input
                            className="h-7 w-16 font-mono uppercase"
                            maxLength={3}
                            value={editCodigo}
                            onChange={e => setEditCodigo(e.target.value.toUpperCase())}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-7"
                            value={editNombre}
                            onChange={e => setEditNombre(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleUpdate(cat.id); }}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleUpdate(cat.id)}>
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{cat.codigo}</Badge>
                        </TableCell>
                        <TableCell>{cat.nombre}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                              setEditId(cat.id); setEditNombre(cat.nombre); setEditCodigo(cat.codigo);
                            }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              disabled={deletingId === cat.id}
                              onClick={() => handleDelete(cat.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Pestaña de tipos de inventario (prefijo del SKU) ─────────────────────────

interface ProductTipoRow {
  id: string;
  valor: string;
  nombre: string;
  codigo: string;
}

function slugifyTipoValor(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

function ProductTiposTab() {
  const { isOwner } = useUserAccess();
  const companyId = useActiveCompanyId();
  const [tiposList, setTiposList] = useState<ProductTipoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNombre, setNewNombre] = useState('');
  const [newCodigo, setNewCodigo] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCodigo, setEditCodigo] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast: showToast } = useToast();

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('product_tipos_inventario')
      .select('id, valor, nombre, codigo')
      .eq('company_id', companyId)
      .order('nombre');
    setTiposList((data ?? []) as ProductTipoRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId]);

  async function handleAdd() {
    if (!newNombre.trim() || newCodigo.trim().length !== 3) {
      showToast({ title: 'El nombre es requerido y el código debe tener exactamente 3 letras', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('product_tipos_inventario').insert({
      company_id: companyId,
      valor: slugifyTipoValor(newNombre) || newCodigo.trim().toLowerCase(),
      nombre: newNombre.trim(),
      codigo: newCodigo.trim().toUpperCase(),
    });
    setSaving(false);
    if (error) { showToast({ title: error.message, variant: 'destructive' }); return; }
    setNewNombre(''); setNewCodigo('');
    load();
  }

  async function handleUpdate(id: string) {
    if (!editNombre.trim() || editCodigo.trim().length !== 3) {
      showToast({ title: 'Nombre requerido y código de 3 letras', variant: 'destructive' });
      return;
    }
    // El "valor" (slug guardado en products.tipo_inventario) no se toca al editar,
    // para no desvincular los productos que ya usan ese tipo.
    const { error } = await supabase.from('product_tipos_inventario')
      .update({ nombre: editNombre.trim(), codigo: editCodigo.trim().toUpperCase() })
      .eq('id', id).eq('company_id', companyId);
    if (error) { showToast({ title: error.message, variant: 'destructive' }); return; }
    setEditId(null);
    load();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from('product_tipos_inventario')
      .delete().eq('id', id).eq('company_id', companyId);
    setDeletingId(null);
    if (error) { showToast({ title: error.message, variant: 'destructive' }); return; }
    load();
  }

  if (!isOwner) {
    return <p className="text-sm text-muted-foreground">Solo el dueño puede gestionar los tipos de inventario.</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4" />
          Tipos de Inventario
        </CardTitle>
        <CardDescription>
          Define los tipos de inventario (Electrónica, A Pedido, Licitaciones, Medicamentos, etc.)
          que aparecen al asignar productos de un embarque o crear uno nuevo. Cada código debe ser
          exactamente 3 letras (ej: MED) y forma parte del SKU.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add row */}
        <div className="flex gap-2 items-end">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Nombre</Label>
            <Input
              placeholder="Medicamentos"
              value={newNombre}
              onChange={e => setNewNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
          <div className="space-y-1 w-24">
            <Label className="text-xs">Código (3)</Label>
            <Input
              placeholder="MED"
              maxLength={3}
              value={newCodigo}
              onChange={e => setNewCodigo(e.target.value.toUpperCase())}
              className="font-mono uppercase"
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
          <Button onClick={handleAdd} disabled={saving} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : tiposList.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay tipos de inventario. Agrega el primero arriba.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiposList.map(t => (
                <TableRow key={t.id}>
                  {editId === t.id ? (
                    <>
                      <TableCell>
                        <Input
                          className="h-7 w-16 font-mono uppercase"
                          maxLength={3}
                          value={editCodigo}
                          onChange={e => setEditCodigo(e.target.value.toUpperCase())}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7"
                          value={editNombre}
                          onChange={e => setEditNombre(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdate(t.id); }}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleUpdate(t.id)}>
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{t.codigo}</Badge>
                      </TableCell>
                      <TableCell>{t.nombre}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                            setEditId(t.id); setEditNombre(t.nombre); setEditCodigo(t.codigo);
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            disabled={deletingId === t.id}
                            onClick={() => handleDelete(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
