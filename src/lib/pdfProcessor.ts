import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Use the local worker bundled with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ─── Constants ────────────────────────────────────────────────────────────────
const GAP_PX = 3;         // gap between cells in points
const MARGIN_X = 16;
const MARGIN_Y = 20;
const RENDER_SCALE = 3;   // 3× for crisp quality

// ─── Page size definitions (points @ 72pt/inch) ───────────────────────────────
export type PageSizeId =
  | 'a4-portrait'
  | 'a4-landscape'
  | 'letter-portrait'
  | 'letter-landscape'
  | 'a3-portrait'
  | 'a3-landscape';

export interface PageSizeDef {
  id: PageSizeId;
  label: string;
  shortLabel: string;
  w: number;
  h: number;
}

export const PAGE_SIZES: PageSizeDef[] = [
  { id: 'a4-portrait',      label: 'A4 Portrait',      shortLabel: 'A4 ↕', w: 595.28,  h: 841.89  },
  { id: 'a4-landscape',     label: 'A4 Landscape',     shortLabel: 'A4 ↔', w: 841.89,  h: 595.28  },
  { id: 'letter-portrait',  label: 'Letter Portrait',  shortLabel: 'Ltr ↕', w: 612,     h: 792     },
  { id: 'letter-landscape', label: 'Letter Landscape', shortLabel: 'Ltr ↔', w: 792,     h: 612     },
  { id: 'a3-portrait',      label: 'A3 Portrait',      shortLabel: 'A3 ↕', w: 841.89,  h: 1190.55 },
  { id: 'a3-landscape',     label: 'A3 Landscape',     shortLabel: 'A3 ↔', w: 1190.55, h: 841.89  },
];

// ─── Fill order ───────────────────────────────────────────────────────────────
export type FillOrder = 'col-first' | 'row-first';

export interface FillOrderDef {
  id: FillOrder;
  label: string;
  desc: string;
}

export const FILL_ORDERS: FillOrderDef[] = [
  { id: 'col-first', label: 'Column-first', desc: 'Fill top→bottom, then next column' },
  { id: 'row-first', label: 'Row-first',    desc: 'Fill left→right, then next row' },
];

// ─── Config interface ─────────────────────────────────────────────────────────
export interface GridConfig {
  cols: number;
  rows: number;
  pageSize: PageSizeId;
  fillOrder: FillOrder;
}

export const DEFAULT_CONFIG: GridConfig = {
  cols: 3,
  rows: 5,
  pageSize: 'a4-portrait',
  fillOrder: 'col-first',
};

export interface ProcessingProgress {
  stage: 'loading' | 'rendering' | 'composing' | 'done';
  current: number;
  total: number;
  message: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCellDims(cols: number, rows: number, pageW: number, pageH: number) {
  const contentW = pageW - MARGIN_X * 2;
  const contentH = pageH - MARGIN_Y * 2;
  const cellW = (contentW - GAP_PX * (cols - 1)) / cols;
  const cellH = (contentH - GAP_PX * (rows - 1)) / rows;
  return { cellW, cellH };
}

/** Map (col, row) → slide index depending on fill order. */
function slideIndex(
  col: number, row: number,
  cols: number, rows: number,
  fillOrder: FillOrder,
  basePage: number,
  slidesPerPage: number
): number {
  const localIdx = fillOrder === 'col-first'
    ? col * rows + row           // column-first: col 0 = slides 0..rows-1
    : row * cols + col;          // row-first:    row 0 = slides 0..cols-1
  return basePage * slidesPerPage + localIdx;
}

async function renderPageToImageData(
  page: pdfjsLib.PDFPageProxy,
  cellWidth: number,
  cellHeight: number
): Promise<ImageBitmap> {
  const viewport = page.getViewport({ scale: 1 });
  const scaleX = cellWidth / viewport.width;
  const scaleY = cellHeight / viewport.height;
  const scale = Math.min(scaleX, scaleY) * RENDER_SCALE;
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scaledViewport.width);
  canvas.height = Math.round(scaledViewport.height);

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

  return createImageBitmap(canvas);
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function processPDF(
  pdfBytes: ArrayBuffer,
  config: GridConfig,
  onProgress: (p: ProcessingProgress) => void
): Promise<Uint8Array> {
  const { cols, rows, fillOrder } = config;
  const pageDef = PAGE_SIZES.find((p) => p.id === config.pageSize) ?? PAGE_SIZES[0];
  const { w: PAGE_W, h: PAGE_H } = pageDef;
  const slidesPerPage = cols * rows;
  const { cellW, cellH } = getCellDims(cols, rows, PAGE_W, PAGE_H);

  // 1. Load
  onProgress({ stage: 'loading', current: 0, total: 1, message: 'Loading PDF…' });
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const totalPages = pdfDoc.numPages;
  onProgress({ stage: 'loading', current: 1, total: 1, message: `Loaded ${totalPages} pages` });

  // 2. Render all pages to bitmaps
  const images: ImageBitmap[] = [];
  for (let i = 0; i < totalPages; i++) {
    onProgress({ stage: 'rendering', current: i + 1, total: totalPages, message: `Rendering page ${i + 1} of ${totalPages}…` });
    const page = await pdfDoc.getPage(i + 1);
    images.push(await renderPageToImageData(page, cellW, cellH));
  }

  // 3. Compose output pages
  const outDoc = await PDFDocument.create();
  const totalOutputPages = Math.ceil(totalPages / slidesPerPage);

  for (let pageIdx = 0; pageIdx < totalOutputPages; pageIdx++) {
    onProgress({ stage: 'composing', current: pageIdx + 1, total: totalOutputPages, message: `Composing page ${pageIdx + 1} of ${totalOutputPages}…` });

    const outPage = outDoc.addPage([PAGE_W, PAGE_H]);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = Math.round(PAGE_W * RENDER_SCALE);
    offCanvas.height = Math.round(PAGE_H * RENDER_SCALE);
    const ctx = offCanvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const idx = slideIndex(col, row, cols, rows, fillOrder, pageIdx, slidesPerPage);
        if (idx >= images.length) continue;

        const bmp = images[idx];
        const cellX = MARGIN_X + col * (cellW + GAP_PX);
        const cellY = MARGIN_Y + row * (cellH + GAP_PX);

        const canvasX = cellX * RENDER_SCALE;
        const canvasY = cellY * RENDER_SCALE;
        const canvasCellW = cellW * RENDER_SCALE;
        const canvasCellH = cellH * RENDER_SCALE;

        const sx = canvasCellW / bmp.width;
        const sy = canvasCellH / bmp.height;
        const s = Math.min(sx, sy);
        const dw = bmp.width * s;
        const dh = bmp.height * s;
        const dx = canvasX + (canvasCellW - dw) / 2;
        const dy = canvasY + (canvasCellH - dh) / 2;

        ctx.fillStyle = '#f8f8fa';
        ctx.fillRect(canvasX, canvasY, canvasCellW, canvasCellH);
        ctx.drawImage(bmp, dx, dy, dw, dh);
        ctx.strokeStyle = '#e0e0e8';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvasX + 0.5, canvasY + 0.5, canvasCellW - 1, canvasCellH - 1);
      }
    }

    const blob = await new Promise<Blob>((res) => offCanvas.toBlob((b) => res(b!), 'image/png'));
    const imgBytes = new Uint8Array(await blob.arrayBuffer());
    const pdfImage = await outDoc.embedPng(imgBytes);
    outPage.drawImage(pdfImage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
  }

  onProgress({ stage: 'done', current: totalOutputPages, total: totalOutputPages, message: 'Done!' });
  return outDoc.save();
}

export async function renderThumbnails(pdfBytes: ArrayBuffer, maxPages = 18): Promise<string[]> {
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const count = Math.min(pdfDoc.numPages, maxPages);
  const thumbs: string[] = [];
  for (let i = 0; i < count; i++) {
    const page = await pdfDoc.getPage(i + 1);
    const viewport = page.getViewport({ scale: 0.3 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    thumbs.push(canvas.toDataURL('image/jpeg', 0.8));
  }
  return thumbs;
}
