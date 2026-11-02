"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCw } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

/** [ymin, xmin, ymax, xmax] on a 0–1000 grid, as the model returns it. */
export type Box = [number, number, number, number];

type Source =
  | { kind: "pdf"; doc: PDFDocumentProxy; pages: number }
  | { kind: "image"; img: HTMLImageElement; pages: 1 };

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

async function openPdf(url: string): Promise<PDFDocumentLoadingTask> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  return pdfjs.getDocument({ url, withCredentials: true });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = url;
  });
}

/** Map a box on the unrotated page to the page as shown, in 0–1 fractions. */
function rotateBox([y0, x0, y1, x1]: Box, rotation: number) {
  const r = {
    top: y0 / 1000,
    left: x0 / 1000,
    bottom: y1 / 1000,
    right: x1 / 1000,
  };
  switch (rotation) {
    case 90:
      return {
        top: r.left,
        left: 1 - r.bottom,
        bottom: r.right,
        right: 1 - r.top,
      };
    case 180:
      return {
        top: 1 - r.bottom,
        left: 1 - r.right,
        bottom: 1 - r.top,
        right: 1 - r.left,
      };
    case 270:
      return {
        top: 1 - r.right,
        left: r.top,
        bottom: 1 - r.left,
        right: r.bottom,
      };
    default:
      return r;
  }
}

export function DocViewer({
  url,
  mime,
  page,
  onPageChange,
  highlight,
  label,
}: {
  url: string;
  mime: string;
  page: number;
  onPageChange: (page: number) => void;
  highlight: { page: number; box: Box } | null;
  label: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  // Keyed by URL, so a new file shows the loading state without resetting state in an effect.
  const [loaded, setLoaded] = useState<{
    url: string;
    source: Source | null;
    failed: boolean;
  }>();
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const source = loaded?.url === url ? loaded.source : null;
  const failed = (loaded?.url === url && loaded.failed) || renderFailed;

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    const done = (s: Source | null) => !cancelled && setLoaded({ url, source: s, failed: !s });
    if (mime === "application/pdf") {
      openPdf(url)
        .then((t) => {
          task = t;
          return t.promise;
        })
        .then((doc) => done({ kind: "pdf", doc, pages: doc.numPages }))
        .catch(() => done(null));
    } else {
      loadImage(url)
        .then((img) => done({ kind: "image", img, pages: 1 }))
        .catch(() => done(null));
    }
    return () => {
      cancelled = true;
      void (task as PDFDocumentLoadingTask | null)?.destroy();
    };
  }, [url, mime]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pages = source?.pages ?? 1;
  const current = Math.min(Math.max(1, page), pages);
  const renderKey = `${url}|${current}|${width}|${zoom}|${rotation}`;
  const rendering = renderedKey !== renderKey;

  useEffect(() => {
    const c = canvas.current;
    if (!source || !c || width === 0) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    const dpr = window.devicePixelRatio || 1;

    (async () => {
      if (source.kind === "pdf") {
        const p = await source.doc.getPage(current);
        if (cancelled) return;
        const base = p.getViewport({ scale: 1, rotation });
        const viewport = p.getViewport({
          scale: (width / base.width) * zoom * dpr,
          rotation,
        });
        c.width = Math.floor(viewport.width);
        c.height = Math.floor(viewport.height);
        c.style.width = `${Math.floor(viewport.width / dpr)}px`;
        task = p.render({ canvas: c, viewport });
        await task.promise;
      } else {
        const { img } = source;
        const turned = rotation % 180 !== 0;
        const w = turned ? img.naturalHeight : img.naturalWidth;
        const h = turned ? img.naturalWidth : img.naturalHeight;
        const scale = (width / w) * zoom * dpr;
        c.width = Math.floor(w * scale);
        c.height = Math.floor(h * scale);
        c.style.width = `${Math.floor((w * scale) / dpr)}px`;
        const ctx = c.getContext("2d")!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      }
      if (!cancelled) setRenderedKey(renderKey);
    })().catch((e: unknown) => {
      // A newer render replaced this one; anything else means the file can't be drawn.
      if (!cancelled && (e as Error)?.name !== "RenderingCancelledException") setRenderFailed(true);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [source, current, width, zoom, rotation, renderKey]);

  const box = highlight && highlight.page === current ? rotateBox(highlight.box, rotation) : null;

  useEffect(() => {
    // Scroll only the viewer pane; scrollIntoView would also move the page around it.
    const f = frame.current;
    const m = mark.current;
    if (!box || rendering || !f || !m) return;
    const fr = f.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    f.scrollBy({
      top: mr.top - fr.top - (fr.height - mr.height) / 2,
      left: mr.left - fr.left - (fr.width - mr.width) / 2,
      behavior: "smooth",
    });
  }, [box?.top, box?.left, rendering]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5 text-sm">
        <ToolButton
          label="Previous page"
          onClick={() => onPageChange(current - 1)}
          disabled={current <= 1}
        >
          <ChevronLeft className="size-4" />
        </ToolButton>
        <span className="num min-w-16 text-center text-ink-2" aria-live="polite">
          {current} / {pages}
        </span>
        <ToolButton
          label="Next page"
          onClick={() => onPageChange(current + 1)}
          disabled={current >= pages}
        >
          <ChevronRight className="size-4" />
        </ToolButton>
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <ToolButton
          label="Zoom out"
          onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}
          disabled={zoom === ZOOMS[0]}
        >
          <Minus className="size-4" />
        </ToolButton>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="num h-8 min-w-14 rounded px-1.5 text-ink-2 hover:bg-info-soft"
          title="Fit to width"
        >
          {Math.round(zoom * 100)}%
        </button>
        <ToolButton
          label="Zoom in"
          onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}
          disabled={zoom === ZOOMS[ZOOMS.length - 1]}
        >
          <Plus className="size-4" />
        </ToolButton>
        <ToolButton label="Rotate" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <RotateCw className="size-4" />
        </ToolButton>
      </div>
      <div ref={frame} className="relative min-h-0 flex-1 overflow-auto bg-info-soft">
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="font-medium">Couldn&apos;t show this file</p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-accent underline-offset-2 hover:underline"
            >
              Open it in a new tab
            </a>
          </div>
        ) : (
          <>
            {(!source || rendering) && (
              <div
                className="skeleton absolute inset-3"
                aria-busy="true"
                aria-label="Loading document"
              />
            )}
            <div className={clsx("relative mx-auto w-fit", (!source || rendering) && "invisible")}>
              <canvas
                ref={canvas}
                role="img"
                aria-label={`${label}, page ${current}`}
                className="block"
              />
              {box && (
                <div
                  ref={mark}
                  aria-hidden
                  className="pointer-events-none absolute rounded-[2px] bg-accent/10 ring-2 ring-accent ring-offset-1"
                  style={{
                    top: `calc(${box.top * 100}% - 3px)`,
                    left: `calc(${box.left * 100}% - 3px)`,
                    width: `calc(${(box.right - box.left) * 100}% + 6px)`,
                    height: `calc(${(box.bottom - box.top) * 100}% + 6px)`,
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  label,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className="inline-flex size-8 items-center justify-center rounded text-ink-2 hover:bg-info-soft disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
