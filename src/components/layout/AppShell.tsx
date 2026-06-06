import { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { CompanySwitcher } from '@/components/layout/CompanySwitcher';
import {
  BarChart3, Package, ShoppingCart, Settings,
  Eye, ChevronDown, ChevronRight, Menu, LogOut, Users, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MODULE_PATHS: Record<string, string[]> = {
  FI:       ['/accounts', '/journal', '/ledger', '/auxiliary-ledgers', '/receivables', '/payables', '/reports'],
  MM:       ['/inventory', '/shipments'],
  SD:       ['/dashboard', '/sales', '/customers'],
  SETTINGS: ['/settings', '/fiscal-years'],
  HOLDING:  ['/holding'],
};

function getActiveModule(pathname: string): string | null {
  for (const [key, paths] of Object.entries(MODULE_PATHS)) {
    if (paths.some(p => pathname === p || pathname.startsWith(p + '/'))) return key;
  }
  return null;
}

function NavItem({ path, label, currentPath, onClick }: {
  path: string;
  label: string;
  currentPath: string;
  onClick?: () => void;
}) {
  const isActive = currentPath === path || currentPath.startsWith(path + '/');
  return (
    <Link
      to={path}
      onClick={onClick}
      className={cn(
        'block px-3 py-1.5 text-sm rounded-md transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      {label}
    </Link>
  );
}

function ModuleSection({ label, badge, icon: Icon, isExpanded, onToggle, children }: {
  label: string;
  badge: string;
  icon: React.ElementType;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" />
          {label}
          {badge && (
            <span className="text-[10px] opacity-40 font-normal normal-case tracking-normal">
              {badge}
            </span>
          )}
        </span>
        {isExpanded
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
      </button>
      {isExpanded && (
        <div className="ml-2 pl-3 border-l border-border space-y-0.5 pb-1">
          {children}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const { signOut } = useAuth();
  const { isOwner, isViewer, isReadOnly, canView, isSubmoduleVisible, companies, loading } = useUserAccess();

  const activeModule = getActiveModule(location.pathname);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>();
    init.add(activeModule ?? 'FI');
    return init;
  });

  useEffect(() => {
    if (activeModule) {
      setExpanded(prev => {
        if (prev.has(activeModule)) return prev;
        const next = new Set(prev);
        next.add(activeModule);
        return next;
      });
    }
  }, [activeModule]);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const close = onClose ?? (() => {});

  const v = (module: ErpModule, sub: string) => canView(module) && isSubmoduleVisible(sub);

  const fiItems = [
    v('accounts',          'accounts')          && { path: '/accounts',          label: 'Plan de Cuentas'   },
    v('journal',           'journal')           && { path: '/journal',           label: 'Libro Diario'      },
    v('ledger',            'ledger')            && { path: '/ledger',            label: 'Libro Mayor'       },
    v('auxiliary_ledgers', 'auxiliary_ledgers') && { path: '/auxiliary-ledgers', label: 'Libros Auxiliares' },
    v('receivables',       'receivables')       && { path: '/receivables',       label: 'Cuentas x Cobrar'  },
    v('payables',          'payables')          && { path: '/payables',          label: 'Cuentas x Pagar'   },
    v('reports',           'reports')           && { path: '/reports',           label: 'Reportes'          },
  ].filter(Boolean) as { path: string; label: string }[];

  return (
    <div className="flex flex-col h-full">
      {/* Logo + nombre ERP */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base leading-tight">ERP BV</span>
          {isReadOnly && (
            <span className="inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded-full">
              <Eye className="w-3 h-3" />
              Solo lectura
            </span>
          )}
        </div>
      </div>
      {/* Company switcher */}
      <CompanySwitcher />

      {!loading && isViewer && (
        <div className="px-3 pt-3 shrink-0">
          <NavItem
            path="/viewer-dashboard"
            label="Panel"
            currentPath={location.pathname}
            onClick={close}
          />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {!loading && (
          <ModuleSection
            label="Finanzas" badge="FI" icon={BarChart3}
            isExpanded={expanded.has('FI')} onToggle={() => toggle('FI')}
          >
            {fiItems.map(item => (
              <NavItem
                key={item.path}
                path={item.path}
                label={item.label}
                currentPath={location.pathname}
                onClick={close}
              />
            ))}
          </ModuleSection>
        )}

        {!loading && (v('inventory', 'inventory') || v('shipments', 'shipments')) && (
          <ModuleSection
            label="Materiales" badge="MM" icon={Package}
            isExpanded={expanded.has('MM')} onToggle={() => toggle('MM')}
          >
            {v('shipments', 'shipments') && <NavItem path="/shipments" label="Embarques"  currentPath={location.pathname} onClick={close} />}
            {v('inventory', 'inventory') && <NavItem path="/inventory" label="Inventario" currentPath={location.pathname} onClick={close} />}
          </ModuleSection>
        )}

        {!loading && (v('sales', 'sales') || v('customers', 'customers')) && (
          <ModuleSection
            label="Ventas" badge="SD" icon={ShoppingCart}
            isExpanded={expanded.has('SD')} onToggle={() => toggle('SD')}
          >
            {v('sales',     'dashboard') && <NavItem path="/dashboard" label="Dashboard" currentPath={location.pathname} onClick={close} />}
            {v('customers', 'customers') && <NavItem path="/customers" label="Clientes"  currentPath={location.pathname} onClick={close} />}
            {v('sales',     'sales')     && <NavItem path="/sales"     label="Ventas"    currentPath={location.pathname} onClick={close} />}
          </ModuleSection>
        )}

        {!loading && canView('holding') && companies.length > 1 && (
          <ModuleSection
            label="Holding" badge="" icon={Building2}
            isExpanded={expanded.has('HOLDING')} onToggle={() => toggle('HOLDING')}
          >
            <NavItem path="/holding" label="Vista Consolidada" currentPath={location.pathname} onClick={close} />
          </ModuleSection>
        )}

        {!loading && (canView('settings') || canView('fiscal_years') || isOwner) && (
          <ModuleSection
            label="Configuración" badge="" icon={Settings}
            isExpanded={expanded.has('SETTINGS')} onToggle={() => toggle('SETTINGS')}
          >
            {isOwner                 && <NavItem path="/users"        label="Usuarios"      currentPath={location.pathname} onClick={close} />}
            {canView('fiscal_years') && <NavItem path="/fiscal-years" label="Gestiones"     currentPath={location.pathname} onClick={close} />}
            {canView('settings')     && <NavItem path="/settings"     label="Configuración" currentPath={location.pathname} onClick={close} />}
          </ModuleSection>
        )}
      </nav>

      <div className="border-t px-3 py-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Cerrar Sesión
        </Button>
      </div>
    </div>
  );
}

export function AppShell() {
  const { isReadOnly } = useUserAccess();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 border-r bg-card flex flex-col',
          'transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <SidebarContent onClose={() => setMobileOpen(false)} />
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-auto md:ml-60">
        <header className="md:hidden shrink-0 border-b bg-card/50 backdrop-blur px-4 h-14 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            className="h-8 w-8"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-sm">ERP BV</span>
          {isReadOnly && (
            <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded-full">
              <Eye className="w-3 h-3" />
              Solo lectura
            </span>
          )}
        </header>

        <Breadcrumbs />

        <main className="flex-1 overflow-auto px-6 py-6">
          <Outlet />
        </main>

        <footer className="shrink-0 border-t bg-card/30 px-6 py-4">
          <p className="text-xs text-muted-foreground">
            {isReadOnly
              ? 'Modo de solo lectura — Estás viendo datos compartidos contigo.'
              : 'ERP BV — Biagi & Varnoux'}
          </p>
        </footer>
      </div>
    </div>
  );
}
