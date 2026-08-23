// src/lib/open-url.ts
// Abrir documentos/URLs de forma que funcione también en la PWA instalada (iOS/Android
// en modo standalone), donde `window.open(url, '_blank')` no hace nada y las descargas
// por blob + <a download> quedan bloqueadas.
//
// Causa raíz en iOS standalone:
//  1) no existe la barra del navegador, así que abrir "una pestaña nueva" es un no-op;
//  2) tras un `await` (p. ej. pedir la URL firmada a Supabase) se pierde la activación
//     por gesto de usuario, y iOS bloquea window.open/anchor.
// `window.location.href = url` no depende de esa activación y abre el visor in-app.

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  // iOS Safari expone navigator.standalone cuando la app se abre desde la pantalla de inicio.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return mm || iosStandalone;
}

/**
 * Abre una URL (documento, PDF, imagen, descarga con Content-Disposition).
 * - PWA instalada: navega en la misma vista → iOS abre el visor/descarga in-app.
 * - Navegador normal: intenta pestaña nueva y cae a la misma vista si el popup se bloquea.
 */
export function openExternalUrl(url: string): void {
  if (!url) return;
  if (isStandalonePWA()) {
    window.location.href = url;
    return;
  }
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) window.location.href = url;
}

/**
 * Descarga (o abre) un Blob generado en el cliente — PDF de jsPDF, CSV, backup JSON.
 * - Navegador normal: descarga clásica con <a download>.
 * - PWA instalada (iOS): el atributo `download` se ignora y navegar a blob: es
 *   inestable; se convierte a data URL y se abre en el visor in-app, desde donde
 *   el usuario puede guardar/compartir con la hoja de compartir de iOS.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (isStandalonePWA()) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') window.location.href = reader.result;
    };
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
