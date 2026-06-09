import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/components/auth/AuthProvider";
import { UserAccessProvider, useUserAccess } from "@/contexts/UserAccessContext";
import { AuthForm } from "@/components/auth/AuthForm";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { MfaVerifyModal } from "@/components/auth/MfaVerifyModal";
import { AccountingProvider } from "@/accounting/AccountingProvider";
import { NavigationHistoryProvider } from "@/contexts/NavigationHistoryContext";
import { AppShell } from "./components/layout/AppShell";
import AccountsPage from "./pages/accounts/Index";
import JournalPage from "./pages/journal/Index";
import AuxiliaryLedgersPage from "./pages/auxiliary-ledgers/Index";
import LedgerPage from "./pages/ledger/Index";
import ReportsPage from "./pages/reports/Index";
import SettingsPage from "./pages/settings/Index";
import ViewerDashboardPage from "./pages/viewer-dashboard/Index";
import ShipmentsPage from "./pages/shipments/Index";
import InventoryPage from "./pages/inventory/Index";
import SalesPage from "./pages/sales/Index";
import CustomersPage from "./pages/customers/Index";
import DashboardPage from "./pages/dashboard/Index";
import FiscalYearsPage from "./pages/fiscal-years/Index";
import ReceivablesPage from "./pages/receivables/Index";
import PayablesPage from "./pages/payables/Index";
import UsersPage from "./pages/users/Index";
import HoldingPage from "./pages/holding/Index";
import LicitacionesPage from "./pages/licitaciones/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function AppRoutes() {
  const { isViewer, isOwner, canView, loading } = useUserAccess();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Cargando permisos...</div>
      </div>
    );
  }

  // Elige la primera ruta que el usuario realmente puede ver.
  // Orden de prioridad: FI → SD → MM → Licitaciones → viewer-dashboard
  const defaultRoute = (() => {
    if (isViewer)                    return "/viewer-dashboard";
    if (canView('accounts'))         return "/accounts";
    if (canView('journal'))          return "/journal";
    if (canView('sales'))            return "/sales";
    if (canView('customers'))        return "/customers";
    if (canView('inventory'))        return "/inventory";
    if (canView('shipments'))        return "/shipments";
    if (canView('receivables'))      return "/receivables";
    if (canView('payables'))         return "/payables";
    if (canView('reports'))          return "/reports";
    if (canView('licitaciones'))     return "/licitaciones";
    if (canView('holding'))          return "/holding";
    return "/viewer-dashboard";      // fallback: sin permisos → pantalla de código
  })();

  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route path="viewer-dashboard" element={<ViewerDashboardPage />} />

        {/* Módulo FI — Finanzas */}
        {canView('accounts')          && <Route path="accounts"          element={<AccountsPage />} />}
        {canView('journal')           && <Route path="journal"           element={<JournalPage />} />}
        {canView('ledger')            && <Route path="ledger"            element={<LedgerPage />} />}
        {canView('auxiliary_ledgers') && <Route path="auxiliary-ledgers" element={<AuxiliaryLedgersPage />} />}
        {canView('reports')           && <Route path="reports"           element={<ReportsPage />} />}
        {canView('fiscal_years')      && <Route path="fiscal-years"      element={<FiscalYearsPage />} />}
        {canView('receivables')       && <Route path="receivables"       element={<ReceivablesPage />} />}
        {canView('payables')          && <Route path="payables"          element={<PayablesPage />} />}

        {/* Módulo MM — Materiales */}
        {canView('shipments')  && <Route path="shipments"  element={<ShipmentsPage />} />}
        {canView('inventory')  && <Route path="inventory"  element={<InventoryPage />} />}

        {/* Módulo SD — Ventas */}
        {canView('sales')      && <Route path="sales"      element={<SalesPage />} />}
        {canView('customers')  && <Route path="customers"  element={<CustomersPage />} />}
        {canView('sales')      && <Route path="dashboard"  element={<DashboardPage />} />}

        {/* Configuración */}
        {canView('settings')   && <Route path="settings"   element={<SettingsPage />} />}
        {isOwner               && <Route path="users"      element={<UsersPage />} />}

        {/* Licitaciones */}
        {canView('licitaciones') && <Route path="licitaciones/*" element={<LicitacionesPage />} />}

        {/* Holding */}
        {canView('holding')    && <Route path="holding"    element={<HoldingPage />} />}

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function AppContent() {
  const { user, loading, mfaState, mfaVerified, signOut, isPasswordRecovery } = useAuth();

  // Wait for auth AND mfa check before rendering anything
  if (loading || mfaState === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  // User arrived via a password-reset email link — show reset form before the ERP
  if (isPasswordRecovery) {
    return <ResetPasswordForm />;
  }

  // MFA enrolled but not yet verified this session — block all routes
  if (mfaState === 'required') {
    return (
      <MfaVerifyModal
        isOpen={true}
        onVerified={mfaVerified}
        onSignOut={signOut}
      />
    );
  }

  return (
    <NavigationHistoryProvider>
      <UserAccessProvider>
        <AccountingProvider>
          <AppRoutes />
        </AccountingProvider>
      </UserAccessProvider>
    </NavigationHistoryProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      {/* BrowserRouter lives here — always mounted, never torn down by auth state changes */}
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
