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

function classicDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Descarga (o abre) un Blob generado en el cliente — PDF de jsPDF, CSV, backup JSON.
 *
 * - PWA instalada (iOS/Android): usa la HOJA DE COMPARTIR nativa
 *   (`navigator.share` con archivos). En iOS standalone, navegar a un `blob:` o
 *   `data:` está bloqueado por el sistema (por eso "no pasaba nada"); la hoja de
 *   compartir sí funciona y permite previsualizar, "Guardar en Archivos",
 *   imprimir o abrir en otra app.
 * - Navegador normal: descarga clásica con <a download>.
 *
 * IMPORTANTE: debe invocarse dentro del gesto del usuario (clic). Los generadores
 * jsPDF/CSV son síncronos, así que la cadena clic → generar → compartir mantiene
 * la activación que iOS exige para `navigator.share`.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const nav = navigator as Navigator & {
    canShare?: (data?: unknown) => boolean;
    share?: (data?: unknown) => Promise<void>;
  };

  if (isStandalonePWA() && typeof File !== 'undefined' && nav.share && nav.canShare) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (nav.canShare({ files: [file] })) {
      // Debe llamarse sincrónicamente aquí (dentro del gesto) para no perder la activación.
      nav.share({ files: [file], title: filename }).catch((err: unknown) => {
        // El usuario canceló → no hacer nada. Cualquier otro fallo → descarga clásica.
        const name = (err as { name?: string })?.name;
        if (name !== 'AbortError' && name !== 'NotAllowedError') classicDownload(blob, filename);
      });
      return;
    }
  }

  classicDownload(blob, filename);
}
