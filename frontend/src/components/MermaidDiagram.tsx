import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "antiscript",
  themeVariables: {
    primaryColor: "#18212f",
    primaryTextColor: "#e2e8f0",
    primaryBorderColor: "#38bdf8",
    lineColor: "#7dd3fc",
    tertiaryColor: "#172033",
    tertiaryTextColor: "#f8fafc",
    tertiaryBorderColor: "#f59e0b",
    background: "#0b1220",
    mainBkg: "#111827",
    secondBkg: "#0f172a",
    edgeLabelBackground: "#0f172a",
    fontFamily: "IBM Plex Sans, Inter, system-ui, sans-serif",
    fontSize: "13px",
  },
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    curve: "basis",
    nodeSpacing: 40,
    rankSpacing: 52,
    padding: 18,
  },
});

interface MermaidDiagramProps {
  syntax: string;
  onNodeClick?: (nodeId: string) => void;
}

interface DiagramSize {
  width: number;
  height: number;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.8;

function extractNodeId(rawId: string | null | undefined) {
  if (!rawId) return null;
  return rawId.replace(/^flowchart-/, "").replace(/-\d+$/, "");
}

export function MermaidDiagram({ syntax, onNodeClick }: MermaidDiagramProps) {
  const containerId = useId().replace(/:/g, "");
  const renderCountRef = useRef(0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // zoom and pan as refs — no re-render on every pointer move
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [rendering, setRendering] = useState(false);
  const [diagramSize, setDiagramSize] = useState<DiagramSize>({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState<DiagramSize>({ width: 0, height: 0 });
  // Only used for the % display — updated on zoom change, not on every pan move
  const [zoomDisplay, setZoomDisplay] = useState(100);

  const fitScale = useMemo(() => {
    if (!diagramSize.width || !diagramSize.height || !viewportSize.width || !viewportSize.height) {
      return 1;
    }

    const pad = 64;
    const scaleX = Math.max((viewportSize.width - pad) / diagramSize.width, 0.2);
    const scaleY = Math.max((viewportSize.height - pad) / diagramSize.height, 0.2);
    return Math.min(scaleX, scaleY, 1.1);
  }, [diagramSize, viewportSize]);

  // Direct DOM manipulation — no React re-render during drag/zoom
  const applyTransform = useCallback((updateDisplay = false) => {
    if (!innerRef.current) return;
    if (!diagramSize.width || !diagramSize.height || !viewportSize.width || !viewportSize.height) return;
    const scale = fitScale * zoomRef.current;
    const centeredX = Math.max((viewportSize.width - diagramSize.width * scale) / 2, 24);
    const centeredY = Math.max((viewportSize.height - diagramSize.height * scale) / 2, 24);
    const x = centeredX + panRef.current.x;
    const y = centeredY + panRef.current.y;
    innerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    if (updateDisplay) setZoomDisplay(Math.round(scale * 100));
  }, [fitScale, diagramSize, viewportSize]);

  // Reposition after resize / fit scale change and sync the display %
  useEffect(() => {
    applyTransform(true);
  }, [applyTransform]);

  useEffect(() => {
    if (!syntax) return;
    let cancelled = false;
    const renderId = `mermaid-${containerId}-${++renderCountRef.current}`;
    setError(null);
    setRendering(true);
    setSelectedNodeId(null);
    setSvgMarkup("");
    setDiagramSize({ width: 0, height: 0 });
    setZoomDisplay(100);
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;

    const render = async () => {
      try {
        const { svg } = await mermaid.render(renderId, syntax);
        if (cancelled) return;
        setSvgMarkup(svg);
      } catch (err) {
        if (cancelled) return;
        setError(String(err));
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [syntax, containerId]);

  useEffect(() => {
    if (!surfaceRef.current || !svgMarkup) return;

    surfaceRef.current.innerHTML = svgMarkup;
    const svgEl = surfaceRef.current.querySelector("svg");
    if (!svgEl) return;

    svgEl.style.maxWidth = "none";
    svgEl.style.height = "auto";
    svgEl.style.display = "block";
    svgEl.classList.add("mermaid-surface__svg");

    const viewBox = svgEl.viewBox.baseVal;
    if (viewBox?.width && viewBox?.height) {
      setDiagramSize({ width: viewBox.width, height: viewBox.height });
    } else {
      const bounds = svgEl.getBoundingClientRect();
      setDiagramSize({ width: bounds.width, height: bounds.height });
    }

    const handleNodeSelect = (nodeId: string) => {
      setSelectedNodeId(nodeId);
      onNodeClick?.(nodeId);
    };

    const nodes = Array.from(svgEl.querySelectorAll<HTMLElement>(".node"));
    nodes.forEach((node) => {
      node.style.cursor = "pointer";
      const nodeId = extractNodeId(node.id);
      if (nodeId) {
        node.dataset.nodeId = nodeId;
      }
    });

    const handleSvgClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const node = target.closest<HTMLElement>(".node");
      if (!node) return;
      const nodeId = node.dataset.nodeId ?? extractNodeId(node.id);
      if (!nodeId) return;
      handleNodeSelect(nodeId);
    };

    svgEl.addEventListener("click", handleSvgClick);
    return () => {
      svgEl.removeEventListener("click", handleSvgClick);
    };
  }, [svgMarkup, onNodeClick]);

  useEffect(() => {
    if (!surfaceRef.current) return;
    const nodes = surfaceRef.current.querySelectorAll<HTMLElement>(".node");
    nodes.forEach((node) => {
      const nodeId = node.dataset.nodeId ?? extractNodeId(node.id);
      node.classList.toggle("mermaid-node--active", nodeId === selectedNodeId);
    });
  }, [selectedNodeId, svgMarkup]);

  useEffect(() => {
    if (!viewportRef.current) return;

    const update = () => {
      if (!viewportRef.current) return;
      const bounds = viewportRef.current.getBoundingClientRect();
      setViewportSize({ width: bounds.width, height: bounds.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewportRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [expanded]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(syntax);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied or not available
      setCopied(false);
    }
  };

  const resetView = () => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    applyTransform(true);
  };

  const zoomBy = (delta: number) => {
    zoomRef.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((zoomRef.current + delta).toFixed(2))));
    applyTransform(true);
  };

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.1 : 0.1);
  };

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(".node, .edgeLabel, .label, .nodeLabel, .cluster-label")
    ) {
      return;
    }
    dragRef.current = { x: event.clientX, y: event.clientY, panX: panRef.current.x, panY: panRef.current.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    panRef.current = { x: dragRef.current.panX + dx, y: dragRef.current.panY + dy };
    applyTransform();
  };

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (!syntax) return null;

  const toolBtnBase =
    "inline-flex items-center justify-center rounded-md border border-slate-800/80 bg-slate-950/80 px-2.5 py-1.5 font-mono text-[11px] font-medium text-slate-400 transition-[background-color,border-color,color] hover:border-slate-700 hover:bg-slate-900 hover:text-slate-200 focus-visible:outline-none";

  const toolBtnActive =
    "inline-flex items-center justify-center rounded-md border border-slate-700/80 bg-slate-800/80 px-2.5 py-1.5 font-mono text-[11px] font-medium text-slate-200 transition-[background-color,border-color,color] hover:border-slate-600 hover:bg-slate-700 focus-visible:outline-none";

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-slate-800/80 bg-slate-950/70 p-0.5">
            <button onClick={() => zoomBy(0.15)} className={toolBtnBase} title="Zoom in" aria-label="Zoom in">+</button>
            <button onClick={() => zoomBy(-0.15)} className={toolBtnBase} title="Zoom out" aria-label="Zoom out">−</button>
            <button onClick={resetView} className={toolBtnBase} title="Reset to fit" aria-label="Reset to fit">Fit</button>
          </div>
          <button onClick={() => setExpanded((v) => !v)} className={expanded ? toolBtnActive : toolBtnBase} aria-label={expanded ? "Compact view" : "Expand view"}>
            {expanded ? "Compact" : "Expand"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={handleCopy} className={copied ? toolBtnActive : toolBtnBase} aria-label={copied ? "Copied to clipboard" : "Copy Mermaid source"}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => setShowSource((s) => !s)} className={showSource ? toolBtnActive : toolBtnBase} aria-label={showSource ? "Hide source" : "Show source"}>
            {showSource ? "Hide src" : "Src"}
          </button>
          <span className="font-mono text-[11px] tabular-nums text-slate-600">{zoomDisplay}%</span>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-300">
          <span className="font-medium">Render error.</span>
          {" "}
          <button onClick={() => setShowSource(true)} className="underline underline-offset-2 hover:text-rose-200">
            View raw syntax
          </button>
        </div>
      ) : (
        <div className={`mermaid-frame${expanded ? " mermaid-frame--expanded" : ""}`}>
          <div className="mermaid-frame__topbar">
            <div className="mermaid-frame__status">
              <span className={`mermaid-pill${rendering ? " opacity-70" : ""}`}>
                {rendering ? "Rendering..." : "Ready"}
              </span>
              <span className="mermaid-frame__note">
                {selectedNodeId ? selectedNodeId : "No node selected"}
              </span>
            </div>
            <div className="mermaid-frame__status">
              <span className="mermaid-frame__note">Ctrl/Cmd + scroll to zoom</span>
            </div>
          </div>

          <div
            ref={viewportRef}
            className={`mermaid-surface${rendering ? " mermaid-surface--rendering" : ""}`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {rendering && !svgMarkup ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-5 w-5 rounded-full border-2 border-slate-700 border-t-cyan-400/80 animate-spin" />
                  <span className="font-mono text-[11px] text-slate-600">Rendering diagram</span>
                </div>
              </div>
            ) : null}
            <div
              ref={innerRef}
              className="mermaid-surface__inner"
            >
              <div ref={surfaceRef} />
            </div>
          </div>
        </div>
      )}

      {showSource ? <pre className="mermaid-raw">{syntax}</pre> : null}
    </div>
  );
}
