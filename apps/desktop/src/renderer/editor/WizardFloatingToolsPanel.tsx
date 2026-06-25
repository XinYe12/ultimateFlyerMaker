import React, { useRef, useState, useEffect, useCallback } from "react";

type Props = {
  title: string;
  visible: boolean;
  children: React.ReactNode;
  boundsRef: React.RefObject<HTMLElement | null>;
  width?: number;
  defaultOffset?: { x: number; y: number };
  resetKey?: string;
};

export default function WizardFloatingToolsPanel({
  title,
  visible,
  children,
  boundsRef,
  width = 340,
  defaultOffset = { x: 24, y: 72 },
  resetKey,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(defaultOffset);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const clampPosition = useCallback((x: number, y: number) => {
    const bounds = boundsRef.current;
    const panel = panelRef.current;
    if (!bounds) return { x, y };
    const maxW = bounds.clientWidth;
    const maxH = bounds.clientHeight;
    const panelW = panel?.offsetWidth ?? width;
    const panelH = panel?.offsetHeight ?? 320;
    return {
      x: Math.max(8, Math.min(maxW - panelW - 8, x)),
      y: Math.max(8, Math.min(maxH - panelH - 8, y)),
    };
  }, [boundsRef, width]);

  useEffect(() => {
    if (!visible || !boundsRef.current) return;
    const maxW = boundsRef.current.clientWidth;
    setPos(clampPosition(Math.max(24, maxW - width - 24), defaultOffset.y));
  }, [resetKey, visible, width, defaultOffset.y, boundsRef, clampPosition]);

  useEffect(() => {
    if (!visible) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      setPos(clampPosition(d.originX + dx, d.originY + dy));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [visible, clampPosition]);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
  };

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width,
        maxHeight: "min(78vh, 640px)",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        borderRadius: 12,
        border: "1px solid #475569",
        background: "rgba(30,41,59,0.97)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        backdropFilter: "blur(10px)",
        overflow: "hidden",
      }}
    >
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid #334155",
          background: "linear-gradient(180deg, rgba(59,130,246,0.12) 0%, transparent 100%)",
          cursor: "grab",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.02em" }}>
          {title}
        </span>
        <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>Drag to move</span>
      </div>
      <div className="ufm-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}
