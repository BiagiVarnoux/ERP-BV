// src/components/journal/JournalEntriesTable.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Undo2, Trash2, Pencil, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { AccountLabel } from './AccountLabel';
import { JournalEntry, Account } from '@/accounting/types';
import { fmt, round2, cmpEntryOrder } from '@/accounting/utils';
import { Badge } from '@/components/ui/badge';
import { DataCard, DataCardHeader, DataCardActions, DataCardList } from '@/components/ui/data-card';

interface JournalEntriesTableProps {
  entries: JournalEntry[];
  accounts: Account[];
  isReadOnly: boolean;
  sortOrder: 'asc' | 'desc';
  selectedQuarter: string;
  onSortOrderChange: () => void;
  onEdit: (entry: JournalEntry) => void;
  onVoid: (entry: JournalEntry) => void;
  onDelete: (id: string) => void;
}

export function JournalEntriesTable({
  entries,
  accounts,
  isReadOnly,
  sortOrder,
  selectedQuarter,
  onSortOrderChange,
  onEdit,
  onVoid,
  onDelete,
}: JournalEntriesTableProps) {
  const sortedEntries = [...entries].sort((a, b) =>
    sortOrder === 'asc' ? cmpEntryOrder(a, b) : cmpEntryOrder(b, a)
  );

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Asientos registrados</CardTitle>
          <Button variant="outline" size="sm" onClick={onSortOrderChange}>
            <ArrowUpDown className="w-4 h-4 mr-2" />
            {sortOrder === 'asc' ? 'Más antiguo' : 'Más reciente'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Móvil: tarjetas apiladas */}
        <DataCardList>
          {sortedEntries.filter(e => e.lines.length > 0).length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No hay asientos registrados para {selectedQuarter}</p>
          ) : (
            sortedEntries.filter(e => e.lines.length > 0).map(e => {
              const entryDiff = e.lines.reduce((sum, l) => sum + l.debit - l.credit, 0);
              const isUnbalanced = Math.abs(round2(entryDiff)) >= 0.01;
              return (
                <DataCard key={e.id} className={isUnbalanced ? 'border-red-300 dark:border-red-800' : ''}>
                  <DataCardHeader
                    title={<span className="font-mono text-sm">{e.id}</span>}
                    subtitle={<>{e.date}{e.entry_time ? ` ${e.entry_time}` : ''}</>}
                    right={isUnbalanced
                      ? <Badge variant="destructive" className="text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{fmt(round2(entryDiff))}</Badge>
                      : undefined}
                  />
                  <div className="mt-2 pt-2 border-t text-sm space-y-1">
                    {e.lines.map((l, i) => {
                      const a = accounts.find(x => x.id === l.account_id);
                      return (
                        <div key={i} className="flex gap-2 items-center">
                          <AccountLabel accountId={l.account_id} accounts={accounts} line={l} />
                          <span className="flex-1 truncate text-xs">{a?.name}</span>
                          <span className="w-20 text-right tabular-nums text-xs">{l.debit ? fmt(l.debit) : ''}</span>
                          <span className="w-20 text-right tabular-nums text-xs">{l.credit ? fmt(l.credit) : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                  {e.memo && <div className="mt-1 text-muted-foreground italic text-xs">{e.memo}</div>}
                  {!isReadOnly && (
                    <DataCardActions className="mt-2 pt-2 border-t">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(e)} disabled={!!e.void_of}><Pencil className="w-3.5 h-3.5 mr-1" />Editar</Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => onVoid(e)}><Undo2 className="w-3.5 h-3.5 mr-1" />Anular</Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onDelete(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </DataCardActions>
                  )}
                </DataCard>
              );
            })
          )}
        </DataCardList>

        {/* Escritorio: tabla */}
        <div className="border rounded-xl overflow-hidden hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Glosa</TableHead>
                <TableHead>Detalle</TableHead>
                {!isReadOnly && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay asientos registrados para {selectedQuarter}
                  </TableCell>
                </TableRow>
              ) : (
                sortedEntries.filter(e => e.lines.length > 0).map(e => {
                  const entryDiff = e.lines.reduce((sum, l) => sum + l.debit - l.credit, 0);
                  const isUnbalanced = Math.abs(round2(entryDiff)) >= 0.01;
                  
                  return (
                  <React.Fragment key={e.id}>
                    <TableRow className={isUnbalanced ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                      <TableCell className="font-mono">
                        <div className="flex items-center gap-2">
                          {e.id}
                          {isUnbalanced && (
                            <Badge variant="destructive" className="text-xs flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {fmt(round2(entryDiff))}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.date}
                        {e.entry_time && (
                          <span className="ml-1 text-xs text-muted-foreground">{e.entry_time}</span>
                        )}
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          {e.lines.map((l, i) => {
                            const a = accounts.find(x => x.id === l.account_id);
                            return (
                              <div key={i} className="flex gap-2 items-center">
                                <AccountLabel accountId={l.account_id} accounts={accounts} line={l} />
                                <span className="flex-1">{a?.name}</span>
                                <span className="w-24 text-right">{l.debit ? fmt(l.debit) : ''}</span>
                                <span className="w-24 text-right">{l.credit ? fmt(l.credit) : ''}</span>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                      {!isReadOnly && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onEdit(e)}
                            title="Editar"
                            disabled={!!e.void_of}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onVoid(e)} title="Anular">
                            <Undo2 className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onDelete(e.id)} title="Eliminar">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                    {e.memo && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground italic text-sm pl-8">
                          {e.memo}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
