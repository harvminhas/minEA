import { toPng } from "html-to-image";
import { getNodesBounds, getViewportForBounds, type Node } from "reactflow";
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
    !domNode.closest("[data-export-ignore]")
  );
}

async function captureVisibleDiagram(flowEl: HTMLElement) {
  return toPng(flowEl, {
    backgroundColor: "#fafafa",
    pixelRatio: 2,
    skipFonts: true,
    cacheBust: true,
    filter: isExportChromeNode,
  });
}

async function captureFullDiagram(viewportEl: HTMLElement, exportNodes: Node[]) {
  const nodesBounds = getNodesBounds(exportNodes);
  const padding = 64;
  const imageWidth = Math.max(900, Math.ceil(nodesBounds.width + padding * 2));
  const imageHeight = Math.max(700, Math.ceil(nodesBounds.height + padding * 2));
  const viewport = getViewportForBounds(
    nodesBounds,
    imageWidth,
    imageHeight,
    0.5,
    2,
    padding / Math.min(imageWidth, imageHeight)
  );

  return toPng(viewportEl, {
    backgroundColor: "#fafafa",
    width: imageWidth,
    height: imageHeight,
    skipFonts: true,
    cacheBust: true,
    filter: isExportChromeNode,
    style: {
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
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
  let dataUrl: string;
  try {
    dataUrl = await captureVisibleDiagram(flowEl);
  } catch {
    dataUrl = await captureFullDiagram(viewportEl, options.exportNodes);
  }
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
