// src/components/journal/JournalEntryForm.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table';
import { Save, Plus, Eye, EyeOff, Clock } from 'lucide-react';
import { JournalLineRow } from './JournalLineRow';
import { Account, JournalEntry } from '@/accounting/types';
import { LineDraft } from '@/hooks/useJournalForm';
import { fmt } from '@/accounting/utils';

interface JournalEntryFormProps {
  date: string;
  onDateChange: (date: string) => void;
  entryTime: string;
  onEntryTimeChange: (time: string) => void;
  memo: string;
  onMemoChange: (memo: string) => void;
  lines: LineDraft[];
  accounts: Account[];
  editingEntry: JournalEntry | null;
  showLineMemos: boolean;
  onToggleLineMemos: () => void;
  totals: { debit: number; credit: number; diff: number };
  onAddLine: () => void;
  onAccountChange: (index: number, accountId: string) => void;
  onLineChange: (index: number, patch: Partial<LineDraft>) => void;
  onRemoveLine: (index: number) => void;
  onSave: () => void;
  onClear: () => void;
}

export function JournalEntryForm({
  date,
  onDateChange,
  entryTime,
  onEntryTimeChange,
  memo,
  onMemoChange,
  lines,
  accounts,
  editingEntry,
  showLineMemos,
  onToggleLineMemos,
  totals,
  onAddLine,
  onAccountChange,
  onLineChange,
  onRemoveLine,
  onSave,
  onClear,
}: JournalEntryFormProps) {
  const [showTime, setShowTime] = React.useState(false);
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{editingEntry ? `Editando Asiento ${editingEntry.id}` : 'Nuevo Asiento'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-6 gap-3">
          <div>
            <div className="flex items-center justify-between">
              <Label>Fecha</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-muted-foreground"
                title="Ajustar la hora del asiento (ordena asientos del mismo día)"
                onClick={() => setShowTime(v => !v)}
              >
                <Clock className="w-3.5 h-3.5 mr-1" />
                Hora
              </Button>
            </div>
            <Input type="date" value={date} onChange={e => onDateChange(e.target.value)} />
            {showTime && (
              <Input
                type="time"
                className="mt-2"
                value={entryTime}
                onChange={e => onEntryTimeChange(e.target.value)}
              />
            )}
          </div>
          <div className="col-span-5">
            <Label>Glosa</Label>
            <Input
              value={memo}
              onChange={e => onMemoChange(e.target.value)}
              placeholder="Descripción del asiento"
            />
          </div>
        </div>

        <div className="border rounded-xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Cuenta</TableHead>
                <TableHead className="w-[200px]">Debe</TableHead>
                <TableHead className="w-[200px]">Haber</TableHead>
                {showLineMemos && <TableHead>Glosa línea</TableHead>}
                <TableHead className="text-right">
                  <Button size="sm" variant="outline" onClick={onAddLine}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => (
                <JournalLineRow
                  key={idx}
                  line={line}
                  index={idx}
                  accounts={accounts}
                  showLineMemos={showLineMemos}
                  onAccountChange={onAccountChange}
                  onLineChange={onLineChange}
                  onRemoveLine={onRemoveLine}
                />
              ))}
              <TableRow>
                <TableCell className="text-right font-medium">Totales</TableCell>
                <TableCell className="font-semibold">{fmt(totals.debit)}</TableCell>
                <TableCell className="font-semibold">{fmt(totals.credit)}</TableCell>
                <TableCell
                  colSpan={showLineMemos ? 2 : 1}
                  className={'text-right font-semibold ' + (totals.diff === 0 ? 'text-green-600' : 'text-red-600')}
                >
                  {totals.diff === 0 ? 'Cuadra' : `Diferencia: ${fmt(totals.diff)}`}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={onSave}>
            <Save className="w-4 h-4 mr-2" />
            {editingEntry ? 'Actualizar asiento' : 'Guardar asiento'}
          </Button>
          <Button variant="outline" onClick={onClear}>
            {editingEntry ? 'Cancelar edición' : 'Limpiar'}
          </Button>
          <Button variant="outline" onClick={onToggleLineMemos}>
            {showLineMemos ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            {showLineMemos ? 'Ocultar glosas en línea' : 'Mostrar glosas en línea'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
