import { useUserAccess } from '@/contexts/UserAccessContext';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  owner:      'Propietario',
  manager:    'Gerente',
  accountant: 'Contador',
  auditor:    'Auditor',
  viewer:     'Lector',
  custom:     'Personalizado',
};

export function CompanySwitcher() {
  const { companies, activeCompany, switchCompany } = useUserAccess();

  // Solo mostrar si el usuario tiene más de una empresa
  if (companies.length <= 1) {
    return (
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-semibold text-sm truncate">
            {activeCompany?.name ?? 'ERP BV'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-b">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between px-2 h-auto py-2 font-normal"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-left min-w-0">
                <p className="font-semibold text-sm truncate leading-tight">
                  {activeCompany?.name ?? 'Empresa'}
                </p>
                <p className="text-xs text-muted-foreground leading-tight">
                  {ROLE_LABELS[activeCompany?.role ?? ''] ?? activeCompany?.role}
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Mis empresas
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {companies.map(company => (
            <DropdownMenuItem
              key={company.company_id}
              onClick={() => switchCompany(company.company_id)}
              className={cn(
                'flex items-start gap-2 cursor-pointer py-2',
                company.company_id === activeCompany?.company_id && 'bg-muted',
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm truncate">{company.name}</span>
                  {company.is_holding && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                      Holding
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ROLE_LABELS[company.role] ?? company.role} · {company.currency}
                </p>
              </div>
              {company.company_id === activeCompany?.company_id && (
                <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
