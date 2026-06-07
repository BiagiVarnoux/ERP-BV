// src/pages/licitaciones/Index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import { Licitacion } from '@/accounting/licitacion-types';
import { LicitacionesLista } from '@/components/licitaciones/LicitacionesLista';
import { LicitacionDetalle } from '@/components/licitaciones/LicitacionDetalle';

export default function LicitacionesPage() {
  return (
    <Routes>
      <Route index element={<ListaView />} />
      <Route path=":id" element={<DetalleView />} />
    </Routes>
  );
}

// ─── Vista lista ───────────────────────────────────────────────────────────────

function ListaView() {
  const navigate = useNavigate();
  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await LicitacionStorage.loadAll();
      setLicitaciones(data);
    } catch (e) {
      toast.error('Error cargando licitaciones');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (lit: Licitacion) => {
    navigate(`/licitaciones/${lit.id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await LicitacionStorage.delete(id);
      setLicitaciones(prev => prev.filter(l => l.id !== id));
      toast.success('Licitación eliminada');
    } catch {
      toast.error('Error al eliminar');
    }
  };

  return (
    <LicitacionesLista
      licitaciones={licitaciones}
      loading={loading}
      onCreated={handleCreated}
      onDelete={handleDelete}
      onOpen={id => navigate(`/licitaciones/${id}`)}
    />
  );
}

// ─── Vista detalle ─────────────────────────────────────────────────────────────

function DetalleView() {
  const navigate = useNavigate();
  const [licitacion, setLicitacion] = useState<Licitacion | null>(null);
  const [loading, setLoading] = useState(true);

  const { id } = useParams<{ id: string }>();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await LicitacionStorage.loadOne(id);
      setLicitacion(data);
    } catch (e) {
      toast.error('Error cargando licitación');
      console.error(e);
      navigate('/licitaciones');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  if (loading || !licitacion) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <LicitacionDetalle
      licitacion={licitacion}
      onBack={() => navigate('/licitaciones')}
      onUpdated={setLicitacion}
      onReload={load}
    />
  );
}
