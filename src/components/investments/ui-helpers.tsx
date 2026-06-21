// src/components/investments/ui-helpers.tsx
// Piezas UI compartidas del módulo de Análisis de Inversión.
import React from 'react';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toDecimal, fmt } from '@/accounting/utils';

export function NumInput({
  value, onChange, className = '', min, step = '0.01', placeholder = '0',
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  className?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <Input
      type="number"
      min={min}
      step={step}
      className={`h-7 text-xs px-1.5 text-right ${className}`}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={e => {
        const raw = e.target.value;
        onChange(raw === '' ? undefined : toDecimal(raw));
      }}
    />
  );
}

export function Pct({ v, decimals = 1 }: { v: number; decimals?: number }) {
  if (!isFinite(v)) return <span>—</span>;
  return <span>{(v * 100).toFixed(decimals)}%</span>;
}

export function Field({ label, hint, className = '', children }: {
  label: string; hint?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-xs text-muted-foreground">
        {label}{hint && <span className="ml-1 opacity-60">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

export function StatCard({ label, value, hint, bold, color, isPct, suffix }: {
  label: string; value: number; hint?: string; bold?: boolean; color?: string; isPct?: boolean; suffix?: string;
}) {
  let text: React.ReactNode;
  if (isPct) text = <Pct v={value} decimals={1} />;
  else if (!isFinite(value)) text = '—';
  else text = `${suffix ? '' : 'Bs '}${fmt(value)}${suffix ?? ''}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="bg-muted/60 rounded px-2.5 py-2 cursor-default">
          <p className="text-[10px] text-muted-foreground">{label}</p>
          <p className={`text-xs font-mono ${bold ? 'font-semibold' : ''} ${color ?? ''}`}>{text}</p>
        </div>
      </TooltipTrigger>
      {hint && <TooltipContent>{hint}</TooltipContent>}
    </Tooltip>
  );
}
