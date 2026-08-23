// src/lib/generated-pdf-viewer.ts
// "Ver" un PDF generado (jsPDF) en el visor NATIVO del sistema, igual que los
// documentos guardados. En iOS PWA no se puede navegar a un blob:/data:, así que
// se sube el PDF a Storage (a la carpeta del usuario, sobrescribiendo) y se abre
// su URL firmada — eso abre el visor in-app de iOS. Si algo falla (sin internet),
// cae a la hoja de compartir / descarga.
import { supabase } from '@/integrations/supabase/client';
import { openExternalUrl, downloadBlob } from '@/lib/open-url';
import { toast } from 'sonner';

const BUCKET = 'generated-pdfs';

export async function viewGeneratedPdf(blob: Blob, filename: string): Promise<void> {
  const loading = toast.loading('Abriendo PDF…');
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('no-session');

    // Un solo archivo por usuario, se sobrescribe en cada vista (no se acumula).
    const path = `${user.id}/preview.pdf`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: 'application/pdf',
      cacheControl: '0',
    });
    if (upErr) throw upErr;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw error ?? new Error('no-url');

    toast.dismiss(loading);
    openExternalUrl(data.signedUrl); // visor nativo (in-app en iOS PWA)
  } catch {
    toast.dismiss(loading);
    // Sin conexión o fallo de subida → hoja de compartir / descarga como respaldo.
    downloadBlob(blob, filename);
  }
}
