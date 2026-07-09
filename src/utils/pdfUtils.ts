// Lazily-loaded pdf.js helpers. pdfjs-dist is large, so it is only imported
// the first time a PDF actually needs rendering (award certificate uploads).

let pdfjsPromise: Promise<any> | null = null;

async function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * Render the first page of a PDF file to a WebP image File.
 * maxDimension bounds the longer side of the output.
 */
export async function renderPdfFirstPageToImage(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.85
): Promise<File> {
  const pdfjs = await getPdfjs();
  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = maxDimension / Math.max(baseViewport.width, baseViewport.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // White background — PDFs are transparent by default
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    return await new Promise<File>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
            type: 'image/webp',
            lastModified: Date.now()
          }));
        } else {
          reject(new Error('PDF preview generation failed'));
        }
      }, 'image/webp', quality);
    });
  } finally {
    // pdfjs v6 exposes cleanup on the loading task, not the document proxy
    try {
      await loadingTask.destroy();
    } catch (cleanupError) {
      console.warn('PDF cleanup failed:', cleanupError);
    }
  }
}
