// src/pages/investments/Index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { InvestmentStorage } from '@/accounting/investment-storage';
import { InvestmentAnalysis } from '@/accounting/investment-types';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { InvestmentsLista } from '@/components/investments/InvestmentsLista';
import { InvestmentDetalle } from '@/components/investments/InvestmentDetalle';

export default function InvestmentsPage() {
  return (
    <Routes>
      <Route index element={<ListaView />} />
      <Route path=":id" element={<DetalleView />} />
    </Routes>
  );
}

// ─── Vista lista ─────────────────────────────────────────────────────────────

function ListaView() {
  const navigate = useNavigate();
  const companyId = useActiveCompanyId();
  const [analyses, setAnalyses] = useState<InvestmentAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      const data = await InvestmentStorage.loadAll(companyId);
      setAnalyses(data);
    } catch (e) {
      toast.error('Error cargando análisis de inversión');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (a: InvestmentAnalysis) => {
    navigate(`/investments/${a.id}`);
  };

  const handleDelete = async (id: string) => {
    if (!companyId) return;
    try {
      await InvestmentStorage.delete(id, companyId);
      setAnalyses(prev => prev.filter(a => a.id !== id));
      toast.success('Análisis eliminado');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  // Reordenar tarjetas: optimista en pantalla, persistido en `orden`.
  const handleReorder = async (ordered: InvestmentAnalysis[]) => {
    if (!companyId) return;
    const previo = analyses;
    setAnalyses(ordered.map((a, i) => ({ ...a, orden: i })));
    try {
      await InvestmentStorage.reorder(companyId, ordered.map(a => a.id));
    } catch (e) {
      setAnalyses(previo);
      toast.error('No se pudo guardar el orden');
      console.error(e);
    }
  };

  return (
    <InvestmentsLista
      analyses={analyses}
      loading={loading}
      companyId={companyId}
      onCreated={handleCreated}
      onDelete={handleDelete}
      onOpen={id => navigate(`/investments/${id}`)}
      onReorder={handleReorder}
    />
  );
}

// ─── Vista detalle ───────────────────────────────────────────────────────────

function DetalleView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<InvestmentAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await InvestmentStorage.loadOne(id);
      setAnalysis(data);
    } catch (e) {
      toast.error('Error cargando el análisis');
      console.error(e);
      navigate('/investments');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  if (loading || !analysis) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <InvestmentDetalle
      analysis={analysis}
      onBack={() => navigate('/investments')}
      onUpdated={setAnalysis}
      onReload={load}
    />
  );
}
