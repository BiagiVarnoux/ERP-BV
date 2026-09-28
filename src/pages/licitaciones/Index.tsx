// src/pages/licitaciones/Index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LicitacionStorage } from '@/accounting/licitacion-storage';
import { Licitacion } from '@/accounting/licitacion-types';
import { useActiveCompanyId } from '@/contexts/UserAccessContext';
import { LicitacionesLista } from '@/components/licitaciones/LicitacionesLista';
import { LicitacionDetalle } from '@/components/licitaciones/LicitacionDetalle';

export default function LicitacionesPage() {
  return (
    <Routes>
      <Route index element={<ListaView />} />
      <Route path=":slug" element={<DetalleView />} />
    </Routes>
  );
}

// ─── Vista lista ───────────────────────────────────────────────────────────────

function ListaView() {
  const navigate = useNavigate();
  const companyId = useActiveCompanyId();
  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      const data = await LicitacionStorage.loadAll(companyId);
      setLicitaciones(data);
    } catch (e) {
      toast.error('Error cargando licitaciones');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (lit: Licitacion) => {
    navigate(`/licitaciones/${lit.id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      await LicitacionStorage.delete(id, companyId);
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
  const companyId = useActiveCompanyId();
  const [licitacion, setLicitacion] = useState<Licitacion | null>(null);
  const [loading, setLoading] = useState(true);

  // El parámetro puede ser el slug legible o un UUID (link viejo); loadOne
  // resuelve ambos.
  const { slug } = useParams<{ slug: string }>();

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      setLoading(true);
      const data = await LicitacionStorage.loadOne(slug, companyId);
      setLicitacion(data);
    } catch (e) {
      toast.error('Error cargando licitación');
      console.error(e);
      navigate('/licitaciones');
    } finally {
      setLoading(false);
    }
  }, [slug, companyId, navigate]);

  useEffect(() => { load(); }, [load]);

  // La barra de direcciones siempre muestra el slug bonito, sin importar cómo se
  // haya llegado (link viejo por UUID, o tras renombrar).
  useEffect(() => {
    if (licitacion?.slug && slug !== licitacion.slug) {
      navigate(`/licitaciones/${licitacion.slug}`, { replace: true });
    }
  }, [licitacion?.slug, slug, navigate]);

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
