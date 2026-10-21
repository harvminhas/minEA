import { toPng } from "html-to-image";
import { getNodesBounds, type Node } from "reactflow";
import { toast } from "@/hooks/use-toast";

export function diagramExportFilename(name: string, fallback = "diagram") {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;
}

export function downloadDataUrl(dataUrl: string, name: string) {
  const link = document.createElement("a");
  link.download = name;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function isExportChromeNode(domNode: unknown) {
  if (!(domNode instanceof HTMLElement)) return true;
  if (domNode instanceof HTMLLinkElement) return false;
  return (
    !domNode.classList.contains("react-flow__controls") &&
    !domNode.classList.contains("react-flow__minimap") &&
    !domNode.classList.contains("react-flow__attribution") &&
    !domNode.classList.contains("react-flow__handle") &&
    !domNode.closest("[data-export-ignore]")
  );
}

/** Padding around the nodes, in diagram pixels. */
export const EXPORT_PADDING = 64;
/** Largest image side we draw at zoom 1 (bigger diagrams are scaled down to fit). */
export const EXPORT_MAX_SIDE = 6000;
/** Browsers refuse canvases much past this many pixels on a side. */
export const EXPORT_MAX_CANVAS = 16384;

export type ExportFrame = { width: number; height: number; x: number; y: number; zoom: number; pixelRatio: number };

/**
 * The whole diagram, not the part on screen: an image sized to every node plus padding, the viewport
 * transform that puts those nodes inside it, and a pixel ratio that stays crisp without passing what
 * a canvas can hold.
 */
export function exportFrame(bounds: { x: number; y: number; width: number; height: number }, padding = EXPORT_PADDING): ExportFrame {
  const fullW = Math.max(1, bounds.width + padding * 2);
  const fullH = Math.max(1, bounds.height + padding * 2);
  const zoom = Math.min(1, EXPORT_MAX_SIDE / Math.max(fullW, fullH));
  const width = Math.ceil(fullW * zoom);
  const height = Math.ceil(fullH * zoom);
  const pixelRatio = Math.max(1, Math.min(2, EXPORT_MAX_CANVAS / Math.max(width, height)));
  return { width, height, x: (padding - bounds.x) * zoom, y: (padding - bounds.y) * zoom, zoom, pixelRatio };
}

async function captureFullDiagram(viewportEl: HTMLElement, exportNodes: Node[]) {
  const frame = exportFrame(getNodesBounds(exportNodes));
  return toPng(viewportEl, {
    backgroundColor: "#ffffff",
    width: frame.width,
    height: frame.height,
    pixelRatio: frame.pixelRatio,
    skipFonts: true,
    cacheBust: true,
    filter: isExportChromeNode,
    style: {
      width: `${frame.width}px`,
      height: `${frame.height}px`,
      transform: `translate(${frame.x}px, ${frame.y}px) scale(${frame.zoom})`,
    },
  });
}

export async function exportDiagramToPng(options: {
  containerEl: HTMLElement;
  exportNodes: Node[];
  filename: string;
  slugFallback?: string;
}): Promise<void> {
  const flowEl = options.containerEl.querySelector(".react-flow") as HTMLElement | null;
  const viewportEl = options.containerEl.querySelector(".react-flow__viewport") as HTMLElement | null;
  if (!flowEl || !viewportEl) {
    throw new Error("Diagram canvas not ready. Try again in a moment.");
  }
  if (options.exportNodes.length === 0) {
    throw new Error("Nothing to export yet.");
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const downloadName = `${diagramExportFilename(options.filename, options.slugFallback)}-architecture.png`;
  // Always the full diagram: capturing the on-screen canvas cut off whatever was panned or expanded out of view.
  const dataUrl = await captureFullDiagram(viewportEl, options.exportNodes);
  downloadDataUrl(dataUrl, downloadName);
}

export async function runDiagramExport(options: {
  containerEl: HTMLElement | null;
  exportNodes: Node[];
  filename: string;
  slugFallback?: string;
  onError: (message: string) => void;
}): Promise<void> {
  try {
    if (!options.containerEl) throw new Error("Diagram canvas not ready.");
    await exportDiagramToPng({
      containerEl: options.containerEl,
      exportNodes: options.exportNodes,
      filename: options.filename,
      slugFallback: options.slugFallback,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not export diagram.";
    options.onError(message);
    toast({ title: "Export failed", description: message, variant: "destructive" });
  }
}
