// src/components/layout/Breadcrumbs.tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Inicio',
  '/accounts': 'Plan de Cuentas',
  '/journal': 'Libro Diario',
  '/auxiliary-ledgers': 'Libros Auxiliares',
  '/ledger': 'Libro Mayor',
  '/reports': 'Reportes',
  '/settings': 'Ajustes',
  '/shipments': 'Embarques',
  '/inventory': 'Inventario',
  '/viewer-dashboard': 'Panel',
};

// Map of routes that expose a "period" filter via sessionStorage.
// key = route path, value = sessionStorage key holding the period label
const PERIOD_KEYS: Record<string, string> = {
  '/journal': 'journal:period',
  '/auxiliary-ledgers': 'auxiliary:period',
  '/ledger': 'ledger:period',
  '/reports': 'reports:period',
};

function readPeriodLabel(routeKey: string): string | null {
  const ssKey = PERIOD_KEYS[routeKey];
  if (!ssKey) return null;
  try {
    const raw = sessionStorage.getItem(ssKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      // Reports shape: { periodType, quarter, year, month }
      if ('periodType' in parsed) {
        if (parsed.periodType === 'monthly') return String(parsed.month);
        if (parsed.periodType === 'annual') return `Año ${parsed.year}`;
        return String(parsed.quarter);
      }
      // Generic { type, value } shape
      if ('value' in parsed) return String(parsed.value);
      if ('label' in parsed) return String(parsed.label);
    }
    return null;
  } catch {
    return null;
  }
}

function clearPeriodLabel(routeKey: string) {
  const ssKey = PERIOD_KEYS[routeKey];
  if (ssKey) sessionStorage.removeItem(ssKey);
}

export function Breadcrumbs() {
  const location = useLocation();
  const pathname = location.pathname;

  // Tick state to re-read period label on focus / interval (sessionStorage isn't reactive)
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => setTick((t) => t + 1), 1500);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [pathname]);

  const currentLabel = ROUTE_LABELS[pathname] ?? pathname.replace(/^\//, '');
  const periodLabel = readPeriodLabel(pathname);

  // Hide on home redirect
  if (pathname === '/' || pathname === '/viewer-dashboard') return null;

  return (
    <div className="border-b bg-muted/30">
      <div className="container px-4 sm:px-6 py-2 flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
        <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          <Home className="h-3.5 w-3.5" />
          <span>Inicio</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{currentLabel}</span>

        {periodLabel && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Badge variant="secondary" className="gap-1 pr-1">
              <span>{periodLabel}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-4 w-4 p-0 hover:bg-transparent"
                title="Restablecer período"
                onClick={() => {
                  clearPeriodLabel(pathname);
                  // Force a soft reload of the route to pick up defaults
                  window.location.reload();
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          </>
        )}
      </div>
    </div>
  );
}
