import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableRow, TableHeader } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Settings, Package, Clock, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useAccounting } from '@/accounting/AccountingProvider';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { ReadOnlyBanner } from '@/components/shared/ReadOnlyBanner';
import { AuxiliaryLedgerEntry, AuxiliaryMovementDetail } from '@/accounting/types';
import { fmt, todayISO, toDecimal, round2 } from '@/accounting/utils';
import { AuxiliaryDefinitionsModal } from '@/components/auxiliary-ledger/AuxiliaryDefinitionsModal';
import { KardexCPP } from '@/components/kardex/KardexCPP';
import { Quarter, getCurrentQuarter, getAllQuartersFromStart, parseQuarterString } from '@/accounting/quarterly-utils';
import {
  PeriodType,
  getCurrentMonth,
  resolvePeriod,
  ResolvedPeriod,
} from '@/accounting/period-utils';
import { PeriodSelector } from '@/components/reports/PeriodSelector';
import { usePersistedState } from '@/hooks/usePersistedState';

export default function AuxiliaryLedgersPage() {
  const { 
    accounts, 
    auxiliaryEntries, 
    auxiliaryDefinitions,
    setAuxiliaryEntries, 
    adapter, 
    entries: journalEntries 
  } = useAccounting();
  const { can } = useUserAccess();
  const canCreate  = can('auxiliary_ledgers', 'create');
  const canEdit    = can('auxiliary_ledgers', 'edit');
  const canDelete  = can('auxiliary_ledgers', 'delete');
  const isReadOnly = !canCreate && !canEdit && !canDelete;
  const [selectedDefinitionId, setSelectedDefinitionId] = usePersistedState<string>('auxiliary:definition', '');
  const [period, setPeriod] = usePersistedState<{ periodType: PeriodType; quarter: string; year: number; month: string }>(
    'auxiliary:period',
    {
      periodType: 'quarterly',
      quarter: getCurrentQuarter().label,
      year: new Date().getFullYear(),
      month: getCurrentMonth().label,
    }
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDefinitionsModalOpen, setIsDefinitionsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AuxiliaryLedgerEntry | null>(null);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [clientMovements, setClientMovements] = useState<Record<string, AuxiliaryMovementDetail[]>>({});
  const [formData, setFormData] = useState({
    client_name: '',
    initial_amount: '0',
    movement_type: 'INCREASE' as 'INCREASE' | 'DECREASE'
  });
  
  // Estado para modal de movimiento manual
  const [isManualMovementModalOpen, setIsManualMovementModalOpen] = useState(false);
  const [manualMovementData, setManualMovementData] = useState({
    client_id: '',
    amount: '',
    movement_type: 'INCREASE' as 'INCREASE' | 'DECREASE'
  });
  const [showClosedClients, setShowClosedClients] = useState(false);

  const availableQuarters = useMemo(() => getAllQuartersFromStart(2020), []);
  const selectedDefinition = auxiliaryDefinitions.find(d => d.id === selectedDefinitionId);
  const selectedAccountId = selectedDefinition?.account_id || '';

  // Resolved period (works for monthly/quarterly/annual). Keeps the same shape used everywhere as `selectedQuarter`.
  const selectedQuarter: ResolvedPeriod = useMemo(() => {
    const value = period.periodType === 'monthly' ? period.month
      : period.periodType === 'quarterly' ? period.quarter
      : String(period.year);
    return resolvePeriod({ type: period.periodType, value });
  }, [period]);
  const currentQuarterObj = useMemo(() => parseQuarterString(period.quarter), [period.quarter]);

  // Cargar TODOS los movimientos cuando cambia la definición seleccionada
  useEffect(() => {
    const loadAllMovements = async () => {
      if (!selectedDefinitionId || !selectedDefinition) return;
      const baseEntries = auxiliaryEntries.filter(entry =>
        entry.definition_id === selectedDefinitionId || entry.account_id === selectedDefinition.account_id
      );
      const ids = baseEntries.map(e => e.id);
      if (ids.length === 0) return;
      try {
        const results = await Promise.all(ids.map(id => adapter.loadAuxiliaryDetails(id)));
        const map: Record<string, AuxiliaryMovementDetail[]> = {};
        ids.forEach((id, i) => { map[id] = results[i]; });
        setClientMovements(map);
      } catch (error: any) {
        toast.error('Error al cargar movimientos');
      }
    };
    loadAllMovements();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDefinitionId, auxiliaryEntries]);

  // Helper to determine quarter for a date
  const getQuarterForDate = (date: string): Quarter | null => {
    return availableQuarters.find(q => 
      date >= q.startDate && date <= q.endDate
    ) || null;
  };

  // Filtrado por trimestre con clasificación de clientes cerrados
  const { activeEntries, closedEntries } = useMemo(() => {
    if (!selectedDefinitionId || !selectedDefinition) {
      return { activeEntries: [], closedEntries: [] };
    }

    const baseEntries = auxiliaryEntries.filter(entry =>
      entry.definition_id === selectedDefinitionId || 
      entry.account_id === selectedDefinition.account_id
    );

    const active: typeof baseEntries = [];
    const closed: typeof baseEntries = [];

    baseEntries.forEach(entry => {
      const movements = clientMovements[entry.id];
      if (!movements) {
        // Aún no cargado, mostrar como activo
        active.push({ ...entry, _movementsLoaded: false } as any);
        return;
      }

      const quarterEnd = selectedQuarter.endDate;
      const quarterStart = selectedQuarter.startDate;

      const quarterBalance = round2(
        movements
          .filter(m => m.movement_date <= quarterEnd)
          .reduce((sum, m) => 
            sum + (m.movement_type === 'INCREASE' ? m.amount : -m.amount), 0
          )
      );

      const hasMovementsInQuarter = movements.some(
        m => m.movement_date >= quarterStart && m.movement_date <= quarterEnd
      );

      const enrichedEntry = {
        ...entry,
        total_balance: quarterBalance,
        _hasMovementsInQuarter: hasMovementsInQuarter,
        _movementsLoaded: true,
      } as any;

      // Clasificación según estado de cierre
      if (!entry.closed_date) {
        // Cliente activo: mostrar si tiene saldo o movimientos
        if (hasMovementsInQuarter || Math.abs(quarterBalance) >= 0.01) {
          active.push(enrichedEntry);
        }
      } else {
        // Cliente cerrado
        const isClosedInCurrentQuarter =
          entry.closed_date >= selectedQuarter.startDate &&
          entry.closed_date <= selectedQuarter.endDate;
        const isClosedInFutureQuarter = 
          selectedQuarter.startDate > entry.closed_date;

        if (isClosedInFutureQuarter) {
          // Trimestre posterior al cierre: NO mostrar
          return;
        }

        if (isClosedInCurrentQuarter) {
          // Trimestre del cierre: sección "Cuentas Cerradas"
          closed.push(enrichedEntry);
        } else {
          // Trimestre anterior al cierre: mostrar como activo histórico
          if (hasMovementsInQuarter || Math.abs(quarterBalance) >= 0.01) {
            active.push(enrichedEntry);
          }
        }
      }
    });

    return { activeEntries: active, closedEntries: closed };
  }, [
    auxiliaryEntries, 
    selectedDefinitionId, 
    selectedDefinition, 
    selectedQuarter, 
    clientMovements,
    availableQuarters
  ]);



  const handleOpenModal = (entry?: AuxiliaryLedgerEntry) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({
        client_name: entry.client_name,
        initial_amount: '0',
        movement_type: 'INCREASE'
      });
    } else {
      setEditingEntry(null);
      setFormData({
        client_name: '',
        initial_amount: '0',
        movement_type: 'INCREASE'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
    setFormData({
      client_name: '',
      initial_amount: '0',
      movement_type: 'INCREASE'
    });
  };

  const handleSave = async () => {
    if (isReadOnly) {
      toast.error('No tienes permisos para modificar registros');
      return;
    }
    if (!selectedDefinitionId) {
      toast.error('Selecciona un libro auxiliar');
      return;
    }

    if (!formData.client_name.trim()) {
      toast.error('El nombre del cliente es requerido');
      return;
    }

    const entry: any = {
      id: editingEntry?.id || crypto.randomUUID(),
      client_name: formData.client_name.trim(),
      account_id: selectedAccountId,
      definition_id: selectedDefinitionId,
      total_balance: editingEntry?.total_balance || 0
    };

    try {
      // Save the auxiliary entry and get the saved object with ID
      const savedEntry = await adapter.upsertAuxiliaryEntry(entry);
      
      // If adding a new client with initial balance, create initial movement
      if (!editingEntry && toDecimal(formData.initial_amount) > 0) {
        const initialMovement: AuxiliaryMovementDetail = {
          id: crypto.randomUUID(),
          aux_entry_id: savedEntry.id,
          journal_entry_id: 'INITIAL_BALANCE',
          movement_date: todayISO(),
          amount: toDecimal(formData.initial_amount),
          movement_type: formData.movement_type
        };
        
        await adapter.upsertAuxiliaryMovementDetails([initialMovement]);
      }
      
      // Reload all entries to get updated balances
      const updatedEntries = await adapter.loadAuxiliaryEntries();
      setAuxiliaryEntries(updatedEntries);
      toast.success(`Cliente ${editingEntry ? 'actualizado' : 'agregado'} exitosamente`);
      handleCloseModal();
    } catch (error: any) {
      toast.error(error.message || 'Error al guardar el cliente');
    }
  };

  const handleDelete = async (id: string) => {
    if (isReadOnly) {
      toast.error('No tienes permisos para eliminar registros');
      return;
    }
    try {
      await adapter.deleteAuxiliaryEntry(id);
      const updatedEntries = await adapter.loadAuxiliaryEntries();
      setAuxiliaryEntries(updatedEntries);
      toast.success('Cliente eliminado exitosamente');
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar el cliente');
    }
  };

  // Handler de cierre
  const handleCloseClient = async (entry: AuxiliaryLedgerEntry) => {
    if (isReadOnly) {
      toast.error('No tienes permisos para cerrar clientes');
      return;
    }
    
    if (Math.abs(entry.total_balance) >= 0.01) {
      toast.error('Solo puedes cerrar clientes con saldo exactamente 0');
      return;
    }
    
    if (!confirm(
      `¿Cerrar el cliente "${entry.client_name}"?\n\n` +
      `Se archivará a partir de hoy y no aparecerá en registros futuros.\n` +
      `Puedes reabrirlo manualmente si lo necesitas.`
    )) {
      return;
    }
    
    try {
      await adapter.closeAuxiliaryEntry(entry.id, todayISO());
      const updatedEntries = await adapter.loadAuxiliaryEntries();
      setAuxiliaryEntries(updatedEntries);
      toast.success(`Cliente "${entry.client_name}" cerrado exitosamente`);
    } catch (error: any) {
      toast.error(error.message || 'Error al cerrar el cliente');
    }
  };

  // Handler de reapertura manual
  const handleReopenClient = async (entry: AuxiliaryLedgerEntry) => {
    if (isReadOnly) {
      toast.error('No tienes permisos para reabrir clientes');
      return;
    }
    
    if (!confirm(
      `¿Reabrir el cliente "${entry.client_name}"?\n\n` +
      `Volverá a estar activo y visible en todos los trimestres.`
    )) {
      return;
    }
    
    try {
      await adapter.reopenAuxiliaryEntry(entry.id);
      const updatedEntries = await adapter.loadAuxiliaryEntries();
      setAuxiliaryEntries(updatedEntries);
      toast.success(`Cliente "${entry.client_name}" reabierto exitosamente`);
    } catch (error: any) {
      toast.error(error.message || 'Error al reabrir el cliente');
    }
  };

  // Handler para agregar movimiento manual
  const handleAddManualMovement = async () => {
    if (isReadOnly) {
      toast.error('No tienes permisos para modificar registros');
      return;
    }
    if (!manualMovementData.client_id) {
      toast.error('Selecciona un cliente');
      return;
    }
    const amount = toDecimal(manualMovementData.amount);
    if (amount <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    try {
      const movement: AuxiliaryMovementDetail = {
        id: crypto.randomUUID(),
        aux_entry_id: manualMovementData.client_id,
        journal_entry_id: 'MANUAL_ADJUSTMENT',
        movement_date: todayISO(),
        amount: amount,
        movement_type: manualMovementData.movement_type
      };

      await adapter.upsertAuxiliaryMovementDetails([movement]);

      // NUEVO: Verificar si el cliente estaba cerrado y reabrirlo
      const clientEntry = auxiliaryEntries.find(
        e => e.id === manualMovementData.client_id
      );
      if (clientEntry?.closed_date) {
        await adapter.reopenAuxiliaryEntry(clientEntry.id);
        toast.info(
          `Cliente "${clientEntry.client_name}" reabierto automáticamente`
        );
      }

      // Reload entries and movements
      const updatedEntries = await adapter.loadAuxiliaryEntries();
      setAuxiliaryEntries(updatedEntries);
      
      // Clear cached movements for this client to reload
      setClientMovements(prev => {
        const updated = { ...prev };
        delete updated[manualMovementData.client_id];
        return updated;
      });

      toast.success('Movimiento agregado exitosamente');
      setIsManualMovementModalOpen(false);
      setManualMovementData({ client_id: '', amount: '', movement_type: 'INCREASE' });
    } catch (error: any) {
      toast.error(error.message || 'Error al agregar movimiento');
    }
  };

  const selectedAccountName = selectedDefinition ? 
    `${selectedDefinition.name} (${selectedDefinition.account_id})` : '';

  // Calculate total sum of balances (solo activos)
  const totalBalance = useMemo(() => {
    return activeEntries.reduce((sum, entry) => sum + entry.total_balance, 0);
  }, [activeEntries]);

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text- font-semibold">Libros Auxiliares</h1>
        {!isReadOnly && (
          <Button variant="outline" onClick={() => setIsDefinitionsModalOpen(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Gestionar Libros Auxiliares
          </Button>
        )}
      </div>

      <Tabs defaultValue="auxiliary" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="auxiliary">
            <TrendingUp className="w-4 h-4 mr-2" />
            Libros Auxiliares
          </TabsTrigger>
          <TabsTrigger value="kardex">
            <Package className="w-4 h-4 mr-2" />
            Kárdex (CPP)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="auxiliary" className="space-y-6 mt-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Seleccionar Libro Auxiliar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Libro Auxiliar</Label>
              <Select value={selectedDefinitionId} onValueChange={setSelectedDefinitionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un libro auxiliar" />
                </SelectTrigger>
                <SelectContent>
                  {auxiliaryDefinitions.length === 0 ? (
                    <SelectItem value="_empty" disabled>
                      No hay libros auxiliares configurados
                    </SelectItem>
                  ) : (
                    auxiliaryDefinitions.map(def => {
                      const account = accounts.find(a => a.id === def.account_id);
                      return (
                        <SelectItem key={def.id} value={def.id}>
                          {def.name} — {def.account_id} ({account?.name || 'N/A'})
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              {auxiliaryDefinitions.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Primero debes crear libros auxiliares usando el botón "Gestionar Libros Auxiliares"
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <Label className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Período
              </Label>
              <PeriodSelector
                periodType={period.periodType}
                onPeriodTypeChange={(t) => setPeriod((p) => ({ ...p, periodType: t }))}
                selectedQuarter={period.quarter}
                onQuarterChange={(q) => setPeriod((p) => ({ ...p, quarter: q }))}
                selectedYear={period.year}
                onYearChange={(y) => setPeriod((p) => ({ ...p, year: y }))}
                selectedMonth={period.month}
                onMonthChange={(m) => setPeriod((p) => ({ ...p, month: m }))}
                availableQuarters={availableQuarters}
                currentQuarter={currentQuarterObj}
              />
            </div>
            {!isReadOnly && (
            <div className="flex items-end gap-2">
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger asChild>
                  <Button 
                    onClick={() => handleOpenModal()} 
                    disabled={!selectedDefinitionId}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Cliente
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingEntry ? 'Editar Cliente' : 'Agregar Nuevo Cliente'}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Nombre del Cliente/Proveedor</Label>
                      <Input
                        value={formData.client_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, client_name: e.target.value }))}
                        placeholder="Nombre completo"
                      />
                    </div>
                    
                    {!editingEntry && (
                      <>
                        <div>
                          <Label>Saldo Inicial</Label>
                          <Input
                            type="text"
                            value={formData.initial_amount}
                            onChange={(e) => setFormData(prev => ({ ...prev, initial_amount: e.target.value }))}
                            placeholder="0,00"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Ingrese el saldo inicial de apertura (opcional)
                          </p>
                        </div>
                        
                        <div>
                          <Label>Tipo de Movimiento Inicial</Label>
                          <Select 
                            value={formData.movement_type} 
                            onValueChange={(value: 'INCREASE' | 'DECREASE') => 
                              setFormData(prev => ({ ...prev, movement_type: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INCREASE">
                                DEBE (Aumento de Activo, Disminución de Pasivo)
                              </SelectItem>
                              <SelectItem value="DECREASE">
                                HABER (Disminución de Activo, Aumento de Pasivo)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    
                    {editingEntry && (
                      <p className="text-sm text-muted-foreground">
                        Los saldos se calculan automáticamente desde los asientos del Libro Diario.
                      </p>
                    )}
                    
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={handleCloseModal}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSave}>
                        {editingEntry ? 'Actualizar' : 'Guardar'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Botón y Modal para Movimiento Manual */}
              <Dialog open={isManualMovementModalOpen} onOpenChange={setIsManualMovementModalOpen}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline"
                    onClick={() => setIsManualMovementModalOpen(true)} 
                    disabled={!selectedDefinitionId || activeEntries.length === 0}
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Agregar Movimiento
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Agregar Movimiento Manual</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Cliente/Proveedor</Label>
                      <Select 
                        value={manualMovementData.client_id} 
                        onValueChange={(value) => setManualMovementData(prev => ({ ...prev, client_id: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeEntries.map(entry => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {entry.client_name} (Saldo: {fmt(entry.total_balance)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Monto</Label>
                      <Input
                        type="text"
                        value={manualMovementData.amount}
                        onChange={(e) => setManualMovementData(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="0,00"
                      />
                    </div>

                    <div>
                      <Label>Tipo de Movimiento</Label>
                      <Select 
                        value={manualMovementData.movement_type} 
                        onValueChange={(value: 'INCREASE' | 'DECREASE') => 
                          setManualMovementData(prev => ({ ...prev, movement_type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INCREASE">
                            <span className="flex items-center gap-2">
                              <TrendingUp className="w-4 h-4 text-primary" />
                              DEBE (Aumento)
                            </span>
                          </SelectItem>
                          <SelectItem value="DECREASE">
                            <span className="flex items-center gap-2">
                              <TrendingDown className="w-4 h-4 text-muted-foreground" />
                              HABER (Disminución)
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setIsManualMovementModalOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleAddManualMovement}>
                        Guardar Movimiento
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedDefinitionId && (
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedAccountName} — {selectedQuarter.label}
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {selectedQuarter.startDate} — {selectedQuarter.endDate}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Cliente/Proveedor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Saldo al {selectedQuarter.endDate}</TableHead>
                    {!isReadOnly && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No hay registros con actividad en {selectedQuarter.label}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {activeEntries.map(entry => {
                        const hasMovementsInQuarter = (entry as any)._hasMovementsInQuarter as boolean;
                        const movementsLoaded = (entry as any)._movementsLoaded as boolean;
                        // Movimientos del trimestre para la vista expandida
                        const allMovements = clientMovements[entry.id] ?? [];
                        const quarterMovements = allMovements
                          .filter(
                            m => m.movement_date >= selectedQuarter.startDate && m.movement_date <= selectedQuarter.endDate
                          )
                          .sort((a, b) => {
                            const ta = journalEntries.find(e => e.id === a.journal_entry_id)?.entry_time || '';
                            const tb = journalEntries.find(e => e.id === b.journal_entry_id)?.entry_time || '';
                            return a.movement_date.localeCompare(b.movement_date)
                              || ta.localeCompare(tb)
                              || (a.journal_entry_id || '').localeCompare(b.journal_entry_id || '');
                          });

                        return (
                          <Collapsible
                            key={entry.id}
                            open={expandedClientId === entry.id}
                            onOpenChange={(open) => setExpandedClientId(open ? entry.id : null)}
                            asChild
                          >
                            <>
                              <TableRow>
                                <TableCell>
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm">
                                      {expandedClientId === entry.id ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </CollapsibleTrigger>
                                </TableCell>
                                <TableCell className="font-medium">
                                  {entry.client_name}
                                </TableCell>
                                <TableCell>
                                  {!movementsLoaded ? (
                                    <Badge variant="outline" className="text-xs">Cargando...</Badge>
                                  ) : hasMovementsInQuarter ? (
                                    <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                                      <TrendingUp className="w-3 h-3 mr-1" />
                                      Activo
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs">
                                      <Clock className="w-3 h-3 mr-1" />
                                      Saldo anterior
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className={`text-right font-semibold ${
                                  entry.total_balance > 0 ? 'text-orange-600' : 
                                  entry.total_balance < 0 ? 'text-destructive' : 'text-green-600'
                                }`}>
                                  {fmt(entry.total_balance)}
                                </TableCell>
                                {!isReadOnly && (
                                  <TableCell className="text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleOpenModal(entry)}
                                      title="Editar"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDelete(entry.id)}
                                      title="Eliminar"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                    {Math.abs(entry.total_balance) < 0.01 && !entry.closed_date && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleCloseClient(entry)}
                                        title="Cerrar cliente (saldo 0)"
                                      >
                                        <Lock className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </TableCell>
                                )}
                              </TableRow>
                              <CollapsibleContent asChild>
                                <TableRow>
                                  <TableCell colSpan={5} className="bg-muted/30 p-4">
                                    <div className="space-y-3">
                                      <h4 className="font-medium text-sm">
                                        Movimientos en {selectedQuarter.label}
                                        {quarterMovements.length > 0 && (
                                          <span className="ml-2 text-muted-foreground font-normal">
                                            ({quarterMovements.length} movimiento{quarterMovements.length !== 1 ? 's' : ''})
                                          </span>
                                        )}
                                      </h4>
                                      {!clientMovements[entry.id] ? (
                                        <div className="text-sm text-muted-foreground">Cargando...</div>
                                      ) : quarterMovements.length === 0 ? (
                                        <div className="text-sm text-muted-foreground">
                                          Sin movimientos en este trimestre — saldo arrastrado de períodos anteriores
                                        </div>
                                      ) : (
                                        <div className="border rounded-lg overflow-hidden bg-background">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Fecha</TableHead>
                                                <TableHead>Asiento</TableHead>
                                                <TableHead>Glosa</TableHead>
                                                <TableHead>Tipo</TableHead>
                                                <TableHead className="text-right">Monto</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {quarterMovements.map((movement) => {
                                                const isInitialBalance = movement.journal_entry_id === 'INITIAL_BALANCE';
                                                const journalEntry = isInitialBalance 
                                                  ? null 
                                                  : journalEntries.find(je => je.id === movement.journal_entry_id);
                                                const memo = isInitialBalance 
                                                  ? 'Saldo inicial de apertura' 
                                                  : (journalEntry?.memo || '-');
                                                
                                                return (
                                                  <TableRow key={movement.id}>
                                                    <TableCell>{movement.movement_date}</TableCell>
                                                    <TableCell className="font-mono text-sm">{movement.journal_entry_id}</TableCell>
                                                    <TableCell className="text-sm">{memo}</TableCell>
                                                    <TableCell>
                                                      {movement.movement_type === 'INCREASE' ? (
                                                        <span className="inline-flex items-center gap-1 text-primary">
                                                          <TrendingUp className="w-3 h-3" />
                                                          DEBE
                                                        </span>
                                                      ) : (
                                                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                                                          <TrendingDown className="w-3 h-3" />
                                                          HABER
                                                        </span>
                                                      )}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-sm">
                                                      {fmt(movement.amount)}
                                                    </TableCell>
                                                  </TableRow>
                                                );
                                              })}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              </CollapsibleContent>
                            </>
                          </Collapsible>
                        );
                      })}
                      <TableRow className="bg-muted/50 font-bold hover:bg-muted/50">
                        <TableCell></TableCell>
                        <TableCell className="font-bold">TOTAL DE SALDOS</TableCell>
                        <TableCell></TableCell>
                        <TableCell className={`text-right font-bold ${
                          totalBalance > 0 ? 'text-orange-600' : 
                          totalBalance < 0 ? 'text-destructive' : 'text-green-600'
                        }`}>
                          {fmt(totalBalance)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {closedEntries.length > 0 && (
        <Card className="mt-6 border-muted">
          <Collapsible open={showClosedClients} onOpenChange={setShowClosedClients}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-start p-4">
                {showClosedClients ? (
                  <ChevronDown className="w-4 h-4 mr-2" />
                ) : (
                  <ChevronRight className="w-4 h-4 mr-2" />
                )}
                <Lock className="w-4 h-4 mr-2 text-muted-foreground" />
                <span className="font-medium">
                  Cuentas Cerradas en {selectedQuarter.label}
                </span>
                <Badge variant="secondary" className="ml-2">
                  {closedEntries.length}
                </Badge>
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Saldo Final</TableHead>
                      <TableHead>Fecha Cierre</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closedEntries.map(entry => (
                      <TableRow key={entry.id} className="text-muted-foreground">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Lock className="w-3 h-3" />
                            {entry.client_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(entry.total_balance)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.closed_date || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {!isReadOnly && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReopenClient(entry)}
                            >
                              Reabrir
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

        </TabsContent>

        <TabsContent value="kardex" className="mt-6">
          <KardexCPP />
        </TabsContent>
      </Tabs>

      <AuxiliaryDefinitionsModal
        isOpen={isDefinitionsModalOpen}
        onClose={() => setIsDefinitionsModalOpen(false)}
      />
    </div>
  );
}