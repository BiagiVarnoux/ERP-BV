import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { DEFAULT_COMPANY_ID } from '@/lib/constants';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CompanyInfo {
  company_id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  is_holding: boolean;
  holding_id: string | null;
  logo_url: string | null;
  role: string;
  joined_at: string;
}

export type ErpModule =
  | 'accounts'
  | 'journal'
  | 'ledger'
  | 'auxiliary_ledgers'
  | 'reports'
  | 'fiscal_years'
  | 'inventory'
  | 'sales'
  | 'customers'
  | 'receivables'
  | 'payables'
  | 'shipments'
  | 'settings'
  | 'holding'
  | 'licitaciones';

export type ModuleAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

export type CompanyRole = 'owner' | 'manager' | 'accountant' | 'auditor' | 'viewer' | 'custom';

export interface ModulePermission {
  module: ErpModule;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
}

export type PermissionsMap = Partial<Record<ErpModule, ModulePermission>>;

/** Permisos legados — mantenidos para compatibilidad con componentes existentes */
export interface UserPermissions {
  can_view_accounts: boolean;
  can_view_journal: boolean;
  can_view_auxiliary: boolean;
  can_view_ledger: boolean;
  can_view_reports: boolean;
}

export interface SharedAccessInfo {
  owner_id: string;
  owner_email?: string;
  permissions: UserPermissions;
}

interface UserAccessContextType {
  // Rol y empresa actual
  role: CompanyRole | null;
  companyId: string | null;

  // Multi-empresa / holding
  companies: CompanyInfo[];
  activeCompany: CompanyInfo | null;
  switchCompany: (companyId: string) => void;

  // Helpers de rol (retrocompatibilidad)
  isOwner: boolean;
  isViewer: boolean;
  isReadOnly: boolean;
  loading: boolean;

  // Permisos granulares
  permissionsMap: PermissionsMap;
  can: (module: ErpModule, action: ModuleAction) => boolean;
  canView: (module: ErpModule) => boolean;

  // Configuración de módulos por empresa (visibilidad de submódulos)
  moduleConfig: Record<string, boolean>;           // submodule → is_visible
  isSubmoduleVisible: (submodule: string) => boolean;
  reloadModuleConfig: () => Promise<void>;

  // Permisos legados (retrocompatibilidad con AppShell y shared_access)
  permissions: UserPermissions;
  sharedAccessList: SharedAccessInfo[];
  currentAccess: SharedAccessInfo | null;
  selectAccess: (ownerId: string) => void;
  targetUserId: string | null;
}

// ─── Valores por defecto ───────────────────────────────────────────────────────

const defaultLegacyPermissions: UserPermissions = {
  can_view_accounts: false,
  can_view_journal: false,
  can_view_auxiliary: false,
  can_view_ledger: false,
  can_view_reports: false,
};

const ownerLegacyPermissions: UserPermissions = {
  can_view_accounts: true,
  can_view_journal: true,
  can_view_auxiliary: true,
  can_view_ledger: true,
  can_view_reports: true,
};

// ─── Context ──────────────────────────────────────────────────────────────────

const UserAccessContext = createContext<UserAccessContextType | undefined>(undefined);

export function useUserAccess() {
  const context = useContext(UserAccessContext);
  if (!context) throw new Error('useUserAccess must be used within a UserAccessProvider');
  return context;
}

export function useActiveCompanyId(): string {
  const { companyId } = useUserAccess();
  return companyId ?? DEFAULT_COMPANY_ID;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UserAccessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [role, setRole] = useState<CompanyRole | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [permissionsMap, setPermissionsMap] = useState<PermissionsMap>({});
  const [loading, setLoading] = useState(true);

  // Multi-empresa
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [activeCompany, setActiveCompany] = useState<CompanyInfo | null>(null);

  // Config de módulos por empresa
  const [moduleConfig, setModuleConfig] = useState<Record<string, boolean>>({});

  // Legado
  const [sharedAccessList, setSharedAccessList] = useState<SharedAccessInfo[]>([]);
  const [currentAccess, setCurrentAccess] = useState<SharedAccessInfo | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadAccess();
  // Use user.id instead of the full user object so token refreshes (TOKEN_REFRESHED)
  // don't re-trigger loadAccess and cause a race condition with loading stuck at true.
  }, [user?.id]);

  const loadAccess = async (overrideCompanyId?: string) => {
    if (!user) return;

    // Safety timeout: never leave loading=true for more than 10 seconds
    const timeout = setTimeout(() => setLoading(false), 10_000);

    try {
      // 0. Cargar todas las empresas del usuario
      const { data: companiesData } = await supabase.rpc('get_my_companies');
      const companiesList = (companiesData as CompanyInfo[]) || [];
      setCompanies(companiesList);

      // 1. Obtener rol y empresa del usuario.
      // Do NOT filter by companiesList[0] here — get_my_companies may return []
      // during session restore (JWT not fully propagated yet), which would cause
      // the query to fall back to DEFAULT_COMPANY_ID and miss the real membership.
      // Query by user_id only so we always find the actual membership.
      const memberQuery = supabase
        .from('company_members')
        .select('id, company_id, role, role_typed')
        .eq('user_id', user.id);

      if (overrideCompanyId) {
        memberQuery.eq('company_id', overrideCompanyId);
      }

      const { data: memberData, error: memberError } = await memberQuery
        .order('created_at' as any, { ascending: true })
        .limit(1)
        .maybeSingle();

      if (memberError) throw memberError;

      if (!memberData) {
        // Fallback: intentar user_roles (tabla legada)
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role, company_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (roleData) {
          setRole(roleData.role as CompanyRole);
          setCompanyId(roleData.company_id);
        }
        setLoading(false);
        return;
      }

      const userRole = (memberData.role_typed || memberData.role) as CompanyRole;
      setRole(userRole);
      setCompanyId(memberData.company_id);

      // Empresa activa
      const active = companiesList.find(c => c.company_id === memberData.company_id) ?? companiesList[0] ?? null;
      setActiveCompany(active);

      // 2b. Cargar config de módulos de la empresa
      await loadModuleConfigForCompany(memberData.company_id);

      // 2. Cargar permisos granulares via RPC
      const { data: permsData, error: permsError } = await supabase
        .rpc('get_my_permissions', { p_company_id: memberData.company_id });

      if (permsError) throw permsError;

      const map: PermissionsMap = {};
      for (const p of (permsData || [])) {
        map[p.module as ErpModule] = {
          module: p.module as ErpModule,
          can_view: p.can_view,
          can_create: p.can_create,
          can_edit: p.can_edit,
          can_delete: p.can_delete,
          can_approve: p.can_approve,
          can_export: p.can_export,
        };
      }
      setPermissionsMap(map);

      // 3. Cargar shared_access legado (para viewers migrados)
      if (userRole === 'viewer') {
        const { data: accessData } = await supabase
          .from('shared_access')
          .select('*')
          .eq('viewer_id', user.id);

        const accessList: SharedAccessInfo[] = (accessData || []).map(a => ({
          owner_id: a.owner_id,
          permissions: {
            can_view_accounts: a.can_view_accounts,
            can_view_journal: a.can_view_journal,
            can_view_auxiliary: a.can_view_auxiliary,
            can_view_ledger: a.can_view_ledger,
            can_view_reports: a.can_view_reports,
          },
        }));
        setSharedAccessList(accessList);
        if (accessList.length > 0) setCurrentAccess(accessList[0]);
      }
    } catch (error) {
      console.error('Error cargando permisos:', error);
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const loadModuleConfigForCompany = async (cid: string) => {
    try {
      const { data, error } = await supabase.rpc('get_company_module_config', { p_company_id: cid });
      if (error) throw error;
      const cfg: Record<string, boolean> = {};
      for (const row of (data || [])) {
        cfg[row.submodule] = row.is_visible;
      }
      setModuleConfig(cfg);
    } catch (e) {
      console.warn('No se pudo cargar module config:', e);
      setModuleConfig({});
    }
  };

  const reloadModuleConfig = async () => {
    if (companyId) await loadModuleConfigForCompany(companyId);
  };

  const switchCompany = useCallback((newCompanyId: string) => {
    setLoading(true);
    loadAccess(newCompanyId);
  }, [user]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const can = useCallback((module: ErpModule, action: ModuleAction): boolean => {
    const p = permissionsMap[module];
    if (!p) return false;
    switch (action) {
      case 'view':    return p.can_view;
      case 'create':  return p.can_create;
      case 'edit':    return p.can_edit;
      case 'delete':  return p.can_delete;
      case 'approve': return p.can_approve;
      case 'export':  return p.can_export;
    }
  }, [permissionsMap]);

  const canView = useCallback((module: ErpModule): boolean => {
    return permissionsMap[module]?.can_view ?? false;
  }, [permissionsMap]);

  const selectAccess = (ownerId: string) => {
    const access = sharedAccessList.find(a => a.owner_id === ownerId);
    if (access) setCurrentAccess(access);
  };

  // Si no hay config guardada para ese submódulo, por defecto es visible (true)
  const isSubmoduleVisible = useCallback((submodule: string): boolean => {
    return moduleConfig[submodule] ?? true;
  }, [moduleConfig]);

  // ─── Valores derivados ─────────────────────────────────────────────────────

  const isOwner = role === 'owner';
  const isViewer = role === 'viewer' || role === 'auditor';
  const isReadOnly = !can('journal', 'create') && !can('accounts', 'create');

  // Permisos legados mapeados desde el nuevo sistema
  const permissions: UserPermissions = isOwner
    ? ownerLegacyPermissions
    : {
        can_view_accounts:  canView('accounts'),
        can_view_journal:   canView('journal'),
        can_view_auxiliary: canView('auxiliary_ledgers'),
        can_view_ledger:    canView('ledger'),
        can_view_reports:   canView('reports'),
      };

  const targetUserId = isViewer && currentAccess ? currentAccess.owner_id : user?.id ?? null;

  return (
    <UserAccessContext.Provider value={{
      role,
      companyId,
      companies,
      activeCompany,
      switchCompany,
      isOwner,
      isViewer,
      isReadOnly,
      loading,
      permissionsMap,
      can,
      canView,
      moduleConfig,
      isSubmoduleVisible,
      reloadModuleConfig,
      permissions,
      sharedAccessList,
      currentAccess,
      selectAccess,
      targetUserId,
    }}>
      {children}
    </UserAccessContext.Provider>
  );
}
