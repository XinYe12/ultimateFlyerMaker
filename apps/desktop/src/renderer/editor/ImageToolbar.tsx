// FILE: apps/desktop/src/renderer/editor/ImageToolbar.tsx
// Fixed right-side toolbar for per-image adjustments (rounded corners, brightness, etc.)
// Visible in editMode when a card item is selected.

import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface ImageToolbarPatch {
  imageRadius?: number;
  imageBrightness?: number;
  imageContrast?: number;
  imageSaturation?: number;
  imageOpacity?: number;
  imageFlipH?: boolean;
  imageFlipV?: boolean;
}

interface ImageToolbarProps {
  card: ImageToolbarPatch | null;
  itemId: string | null;
  onUpdateCard: (patch: ImageToolbarPatch) => void;
  onEditCutout: () => void;
  onRerunCutout?: (model: string) => void;
  rerunningCutout?: boolean;
  visible: boolean;
}

type SliderTool = 'rounded' | 'brightness' | 'contrast' | 'saturation' | 'opacity';

// ── Custom drag slider (avoids controlled-input re-render killing drag state) ──

function DragSlider({
  min, max, step, value, onChange,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const clampSnap = useCallback((raw: number) => {
    const snapped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, snapped));
  }, [min, max, step]);

  const valueFromEvent = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampSnap(min + pct * (max - min));
  }, [min, max, clampSnap, value]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    const newVal = valueFromEvent(e.clientX);
    onChange(newVal);

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      onChange(valueFromEvent(ev.clientX));
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [onChange, valueFromEvent]);

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div
      ref={trackRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'relative',
        height: 20,
        display: 'flex',
        alignItems: 'center',
        cursor: 'ew-resize',
        userSelect: 'none',
      }}
    >
      {/* Track background */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        height: 4, borderRadius: 2,
        background: '#e5e7eb',
      }} />
      {/* Filled portion */}
      <div style={{
        position: 'absolute', left: 0,
        width: `${pct}%`,
        height: 4, borderRadius: 2,
        background: '#3b82f6',
        pointerEvents: 'none',
      }} />
      {/* Thumb */}
      <div style={{
        position: 'absolute',
        left: `${pct}%`,
        transform: 'translateX(-50%)',
        width: 14, height: 14,
        borderRadius: '50%',
        background: '#fff',
        border: '2px solid #3b82f6',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}

// ── Toolbar icon button ───────────────────────────────────────────────────────

function Btn({
  icon, title, active, modified, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  modified?: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: 36, height: 36,
        border: active ? '1.5px solid #3b82f6' : '1.5px solid transparent',
        borderRadius: 8,
        background: active ? '#eff6ff' : hovered ? '#f3f4f6' : 'transparent',
        color: active ? '#2563eb' : '#374151',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.1s, border-color 0.1s, color 0.1s',
      }}
    >
      {icon}
      {modified && !active && (
        <span style={{
          position: 'absolute',
          top: 3, right: 3,
          width: 5, height: 5,
          borderRadius: '50%',
          background: '#3b82f6',
        }} />
      )}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#f3f4f6', margin: '2px 2px' }} />;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ImageToolbar({ card, itemId, onUpdateCard, onEditCutout, onRerunCutout, rerunningCutout, visible }: ImageToolbarProps) {
  const [activeTool, setActiveTool] = useState<SliderTool | null>(null);
  const popoutRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close popout when clicking outside both panels
  useEffect(() => {
    if (!activeTool) return;
    const handler = (e: MouseEvent) => {
      if (
        popoutRef.current?.contains(e.target as Node) ||
        toolbarRef.current?.contains(e.target as Node)
      ) return;
      setActiveTool(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeTool]);

  // Close popout only when a DIFFERENT card is selected, not when values change
  const prevItemIdRef = useRef(itemId);
  useEffect(() => {
    if (prevItemIdRef.current !== itemId) {
      prevItemIdRef.current = itemId;
      setActiveTool(null);
    }
  }, [itemId]);

  if (!visible || !card) return null;

  const radius     = card.imageRadius     ?? 0;
  const brightness = card.imageBrightness ?? 100;
  const contrast   = card.imageContrast   ?? 100;
  const saturation = card.imageSaturation ?? 100;
  const opacity    = card.imageOpacity    ?? 100;
  const flipH      = card.imageFlipH      ?? false;
  const flipV      = card.imageFlipV      ?? false;

  const sliderTools: {
    id: SliderTool;
    title: string;
    icon: React.ReactNode;
    value: number;
    min: number;
    max: number;
    step: number;
    defaultVal: number;
    displayFn: (v: number) => string;
    propKey: keyof ImageToolbarPatch;
  }[] = [
    {
      id: 'rounded', title: 'Rounded Corners', icon: <RoundedIcon />,
      value: radius, min: 0, max: 50, step: 1, defaultVal: 0,
      displayFn: (v) => `${v}%`,
      propKey: 'imageRadius',
    },
    {
      id: 'brightness', title: 'Brightness', icon: <SunIcon />,
      value: brightness, min: 0, max: 200, step: 5, defaultVal: 100,
      displayFn: (v) => v === 100 ? '±0' : v > 100 ? `+${v - 100}` : `${v - 100}`,
      propKey: 'imageBrightness',
    },
    {
      id: 'contrast', title: 'Contrast', icon: <ContrastIcon />,
      value: contrast, min: 0, max: 200, step: 5, defaultVal: 100,
      displayFn: (v) => v === 100 ? '±0' : v > 100 ? `+${v - 100}` : `${v - 100}`,
      propKey: 'imageContrast',
    },
    {
      id: 'saturation', title: 'Saturation', icon: <DropIcon />,
      value: saturation, min: 0, max: 200, step: 5, defaultVal: 100,
      displayFn: (v) => v === 100 ? '±0' : v > 100 ? `+${v - 100}` : `${v - 100}`,
      propKey: 'imageSaturation',
    },
    {
      id: 'opacity', title: 'Opacity', icon: <OpacityIcon />,
      value: opacity, min: 10, max: 100, step: 5, defaultVal: 100,
      displayFn: (v) => `${v}%`,
      propKey: 'imageOpacity',
    },
  ];

  const activeDef = activeTool ? sliderTools.find(t => t.id === activeTool) ?? null : null;

  const TOOLBAR_RIGHT = 8;
  const TOOLBAR_W = 48;
  const POPOUT_GAP = 6;
  const POPOUT_W = 176;

  return (
    <>
      {/* ── Slider popout panel ── */}
      {activeDef && (
        <div
          ref={popoutRef}
          style={{
            position: 'fixed',
            right: TOOLBAR_RIGHT + TOOLBAR_W + POPOUT_GAP,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10001,
            background: '#fff',
            borderRadius: 10,
            boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
            border: '1px solid #e5e7eb',
            padding: '10px 14px',
            width: POPOUT_W,
            userSelect: 'none',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{activeDef.title}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#6b7280', minWidth: 28, textAlign: 'right' }}>
                {activeDef.displayFn(activeDef.value)}
              </span>
              {activeDef.value !== activeDef.defaultVal && (
                <button
                  title="Reset to default"
                  onClick={() => onUpdateCard({ [activeDef.propKey]: activeDef.defaultVal } as ImageToolbarPatch)}
                  style={{
                    fontSize: 13, color: '#6b7280', background: '#f3f4f6',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                    padding: '1px 6px', lineHeight: 1.5,
                  }}
                >
                  ↺
                </button>
              )}
            </div>
          </div>
          <DragSlider
            min={activeDef.min}
            max={activeDef.max}
            step={activeDef.step}
            value={activeDef.value}
            onChange={(v) => onUpdateCard({ [activeDef.propKey]: v } as ImageToolbarPatch)}
          />
        </div>
      )}

      {/* ── Icon toolbar strip ── */}
      <div
        ref={toolbarRef}
        style={{
          position: 'fixed',
          right: TOOLBAR_RIGHT,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 10001,
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          border: '1px solid #e5e7eb',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          userSelect: 'none',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Greyed-out overlay while BiRefNet is running */}
        {rerunningCutout && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 12, zIndex: 1,
            background: 'rgba(255,255,255,0.7)', cursor: 'not-allowed',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 6,
          }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              width: 20, height: 20,
              border: '2.5px solid rgba(59,130,246,0.2)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'ufm-spin 0.75s linear infinite',
            }} />
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#3b82f6',
              letterSpacing: '0.05em', textTransform: 'uppercase',
              textAlign: 'center', lineHeight: 1.3,
            }}>Cutting<br/>out…</span>
          </div>
        )}

        <Btn
          title="Edit Cutout"
          icon={<ScissorsIcon />}
          onClick={() => { setActiveTool(null); onEditCutout(); }}
        />
        <Btn
          title={rerunningCutout ? 'Processing with BiRefNet…' : 'Redo Cutout with BiRefNet General'}
          icon={<BiRefNetIcon />}
          active={rerunningCutout}
          onClick={() => { if (!rerunningCutout) onRerunCutout?.('birefnet-general'); }}
        />

        <Divider />

        {sliderTools.map(t => (
          <Btn
            key={t.id}
            title={t.title + (t.value !== t.defaultVal ? ` (${t.displayFn(t.value)})` : '')}
            icon={t.icon}
            active={activeTool === t.id}
            modified={t.value !== t.defaultVal}
            onClick={() => setActiveTool(prev => prev === t.id ? null : t.id)}
          />
        ))}

        <Divider />

        <Btn
          title={`Flip Horizontal${flipH ? ' (on)' : ''}`}
          icon={<FlipHIcon />}
          active={flipH}
          onClick={() => onUpdateCard({ imageFlipH: !flipH })}
        />
        <Btn
          title={`Flip Vertical${flipV ? ' (on)' : ''}`}
          icon={<FlipVIcon />}
          active={flipV}
          onClick={() => onUpdateCard({ imageFlipV: !flipV })}
        />
      </div>
    </>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function ScissorsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/>
      <line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  );
}

function RoundedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="18" height="18" rx="6" ry="6"/>
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="4"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/>
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/>
      <line x1="2" y1="12" x2="4" y2="12"/>
      <line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/>
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>
    </svg>
  );
}

function ContrastIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 2a10 10 0 0 0 0 20V2z" fill="currentColor"/>
    </svg>
  );
}

function DropIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
    </svg>
  );
}

function OpacityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9"/>
      <line x1="3" y1="12" x2="21" y2="12" strokeWidth="1" strokeDasharray="2 2" opacity="0.5"/>
      <line x1="12" y1="3" x2="12" y2="21" strokeWidth="1" strokeDasharray="2 2" opacity="0.5"/>
    </svg>
  );
}

function FlipHIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3L4 8l5 5"/>
      <path d="M15 3l5 5-5 5"/>
      <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="3 2"/>
    </svg>
  );
}

function FlipVIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l5-5 5 5"/>
      <path d="M3 15l5 5 5-5"/>
      <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="3 2"/>
    </svg>
  );
}

function BiRefNetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 10 10"/>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83"/>
      <circle cx="18" cy="6" r="3" fill="currentColor" stroke="none" opacity="0.7"/>
      <path d="M18 3v6M15 6h6" stroke="white" strokeWidth="1.5"/>
    </svg>
  );
}

