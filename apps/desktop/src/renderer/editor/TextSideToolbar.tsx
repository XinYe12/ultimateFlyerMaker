// FILE: apps/desktop/src/renderer/editor/TextSideToolbar.tsx
// Fixed right-side toolbar for text (title/price) adjustments.
// Mirrors the ImageToolbar icon-strip + popout panel pattern.

import React, { useState, useRef, useEffect } from 'react';
import { FONT_OPTIONS } from './fontOptions';

type TextEffect = 'stroke' | 'glow' | 'shadow';
type ActivePopout = 'font' | 'effect' | 'apply' | null;

const EFFECT_OPTIONS: { value: TextEffect | ''; label: string }[] = [
  { value: '', label: 'No Effect' },
  { value: 'stroke', label: 'Stroke' },
  { value: 'glow', label: 'Glow' },
  { value: 'shadow', label: 'Drop Shadow' },
];

const EFFECT_DEFAULT_COLOR: Record<TextEffect, string> = {
  stroke: '#000000',
  glow: '#ffffff',
  shadow: '#000000',
};

export interface TextSideToolbarProps {
  activeSection: 'title' | 'price';
  itemId: string | null;
  titleFont?: string;
  titleColor?: string;
  titleItalic?: boolean;
  titleBg?: string;
  titleBgPad?: number;
  titleEffect?: TextEffect;
  priceFont?: string;
  priceColor?: string;
  priceShowDollar?: boolean;
  priceBg?: string;
  priceBgPad?: number;
  priceEffect?: TextEffect;
  titleScale?: number;
  priceScale?: number;
  onTitleFontChange: (v: string) => void;
  onTitleColorChange: (v: string) => void;
  onTitleItalicToggle: () => void;
  onTitleBgChange: (v: string | undefined) => void;
  onTitleBgPadChange: (v: number) => void;
  onTitleEffectChange: (v: TextEffect | undefined) => void;
  onTitleScaleChange: (v: number) => void;
  onPriceFontChange: (v: string) => void;
  onPriceColorChange: (v: string) => void;
  onShowDollarToggle: () => void;
  onPriceBgChange: (v: string | undefined) => void;
  onPriceBgPadChange: (v: number) => void;
  onPriceEffectChange: (v: TextEffect | undefined) => void;
  onPriceScaleChange: (v: number) => void;
  onOpenComponentEditor: () => void;
  onApplyToDepartment?: () => void;
  onApplyGlobally?: () => void;
  departmentLabel?: string;
  onClose: () => void;
  visible: boolean;
}

function Btn({ icon, title, active, modified, onClick }: {
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
          position: 'absolute', top: 3, right: 3,
          width: 5, height: 5, borderRadius: '50%', background: '#3b82f6',
        }} />
      )}
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#f3f4f6', margin: '2px 2px' }} />;
}

function FontIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function EffectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
    </svg>
  );
}

function ApplyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
      <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
      <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
      <line x1="17" y1="16" x2="23" y2="16"/>
    </svg>
  );
}

export default function TextSideToolbar({
  activeSection,
  itemId,
  titleFont, titleColor = '#000000', titleItalic,
  titleBg, titleBgPad = 2, titleEffect, titleScale,
  priceFont, priceColor = '#000000', priceShowDollar,
  priceBg, priceBgPad = 2, priceEffect, priceScale,
  onTitleFontChange, onTitleColorChange, onTitleItalicToggle,
  onTitleBgChange, onTitleBgPadChange, onTitleEffectChange, onTitleScaleChange,
  onPriceFontChange, onPriceColorChange, onShowDollarToggle,
  onPriceBgChange, onPriceBgPadChange, onPriceEffectChange, onPriceScaleChange,
  onOpenComponentEditor,
  onApplyToDepartment,
  onApplyGlobally,
  departmentLabel,
  onClose,
  visible,
}: TextSideToolbarProps) {
  const [activePopout, setActivePopout] = useState<ActivePopout>(null);
  const popoutRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close popout when clicking outside both panels
  useEffect(() => {
    if (!activePopout) return;
    const handler = (e: MouseEvent) => {
      if (
        popoutRef.current?.contains(e.target as Node) ||
        toolbarRef.current?.contains(e.target as Node)
      ) return;
      setActivePopout(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activePopout]);

  // Close popout when a different card is selected
  const prevItemIdRef = useRef(itemId);
  useEffect(() => {
    if (prevItemIdRef.current !== itemId) {
      prevItemIdRef.current = itemId;
      setActivePopout(null);
    }
  }, [itemId]);

  if (!visible) return null;

  const isTitle = activeSection === 'title';
  const font = isTitle ? titleFont : priceFont;
  const color = isTitle ? titleColor : priceColor;
  const effect = isTitle ? titleEffect : priceEffect;
  const effectColor = isTitle ? titleBg : priceBg;
  const effectSize = isTitle ? titleBgPad : priceBgPad;
  const scale = isTitle ? (titleScale ?? 1) : (priceScale ?? 1);
  const onFontChange = isTitle ? onTitleFontChange : onPriceFontChange;
  const onColorChange = isTitle ? onTitleColorChange : onPriceColorChange;
  const onEffectChange = isTitle ? onTitleEffectChange : onPriceEffectChange;
  const onEffectColorChange = isTitle ? onTitleBgChange : onPriceBgChange;
  const onEffectSizeChange = isTitle ? onTitleBgPadChange : onPriceBgPadChange;
  const onScaleChange = isTitle ? onTitleScaleChange : onPriceScaleChange;

  const activeFontLabel =
    FONT_OPTIONS.find(o => o.value === '' ? !font : font === o.value)?.label ?? 'Default';

  const TOOLBAR_RIGHT = 8;
  const TOOLBAR_W = 48;
  const POPOUT_GAP = 6;
  const POPOUT_W = 210;

  return (
    <>
      {/* Popout panel */}
      {activePopout && (
        <div
          ref={popoutRef}
          data-keep-selection="true"
          onMouseDown={(e) => e.stopPropagation()}
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
            padding: '12px 14px',
            width: POPOUT_W,
            userSelect: 'none',
          }}
        >
          {/* Font popout */}
          {activePopout === 'font' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                {isTitle ? 'Title Font' : 'Price Font'}
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                {FONT_OPTIONS.map(opt => {
                  const isActive = opt.value === '' ? !font : font === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => { onFontChange(opt.value); setActivePopout(null); }}
                      style={{
                        display: 'block', width: '100%', padding: '7px 12px',
                        textAlign: 'left', border: 'none',
                        borderBottom: '1px solid #f3f4f6',
                        background: isActive ? '#eff6ff' : '#fff',
                        color: isActive ? '#1d4ed8' : '#374151',
                        fontFamily: opt.value || undefined,
                        fontSize: 13, fontWeight: isActive ? 700 : 400, cursor: 'pointer',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f9fafb'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#fff'; }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', flexShrink: 0 }}>Size</span>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => onScaleChange(Math.max(0.2, Math.round((scale - 0.05) * 100) / 100))}
                  style={{ width: 22, height: 22, border: '1px solid #d1d5db', borderRadius: 4, background: '#f9fafb', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >−</button>
                <input
                  type="number"
                  min={20} max={300} step={5}
                  value={Math.round(scale * 100)}
                  onMouseDown={e => e.stopPropagation()}
                  onChange={e => {
                    const pct = Math.min(300, Math.max(20, Number(e.target.value)));
                    onScaleChange(pct / 100);
                  }}
                  style={{ width: 52, height: 24, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, textAlign: 'center', padding: '0 4px' }}
                />
                <span style={{ fontSize: 11, color: '#6b7280' }}>%</span>
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => onScaleChange(Math.min(3.0, Math.round((scale + 0.05) * 100) / 100))}
                  style={{ width: 22, height: 22, border: '1px solid #d1d5db', borderRadius: 4, background: '#f9fafb', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >+</button>
              </div>
            </>
          )}

          {/* Effect popout */}
          {activePopout === 'effect' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
                Text Effect
              </div>
              <select
                value={effect ?? ''}
                onChange={(e) => {
                  const val = e.target.value as TextEffect | '';
                  onEffectChange(val || undefined);
                  if (val && !effectColor) onEffectColorChange(EFFECT_DEFAULT_COLOR[val as TextEffect]);
                }}
                style={{
                  width: '100%', height: 30, padding: '0 6px',
                  border: '1px solid #d1d5db', borderRadius: 6,
                  background: effect ? '#eff6ff' : '#f9fafb',
                  color: effect ? '#1d4ed8' : '#374151',
                  fontSize: 12, marginBottom: 10,
                }}
              >
                {EFFECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>

              {effect && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label
                    title="Effect color"
                    style={{
                      width: 28, height: 28, borderRadius: 6,
                      border: '1px solid #d1d5db', background: effectColor ?? '#000000',
                      cursor: 'pointer', position: 'relative', overflow: 'hidden', flexShrink: 0,
                    }}
                  >
                    <input
                      type="color"
                      value={effectColor ?? '#000000'}
                      onChange={e => onEffectColorChange(e.target.value)}
                      style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                    />
                  </label>
                  <input
                    type="number" min={1} max={20} step={1} value={effectSize}
                    onChange={e => onEffectSizeChange(Math.max(1, Number(e.target.value)))}
                    title="Effect size (px)"
                    style={{
                      width: 50, height: 28, border: '1px solid #d1d5db', borderRadius: 6,
                      fontSize: 12, textAlign: 'center', padding: '0 4px',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#6b7280' }}>px</span>
                  <button
                    onClick={() => onEffectChange(undefined)}
                    title="Remove effect"
                    style={{
                      height: 26, padding: '0 7px', borderRadius: 6,
                      border: '1px solid #fca5a5', background: '#fff1f2',
                      color: '#ef4444', fontSize: 13, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginLeft: 'auto',
                    }}
                  >✕</button>
                </div>
              )}
            </>
          )}

          {activePopout === 'apply' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                Apply {isTitle ? 'title' : 'price'} style
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10, lineHeight: 1.4 }}>
                Copy font, color, size &amp; effects to other text fields.
              </div>
              {onApplyToDepartment && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => { onApplyToDepartment(); setActivePopout(null); }}
                  style={{
                    display: 'block', width: '100%', marginBottom: 8,
                    padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #d1d5db', background: '#fff',
                    color: '#374151', fontSize: 12, fontWeight: 600,
                    textAlign: 'left', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                >
                  This department
                  {departmentLabel ? (
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: '#6b7280', marginTop: 2 }}>
                      {departmentLabel}
                    </span>
                  ) : null}
                </button>
              )}
              {onApplyGlobally && (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => { onApplyGlobally(); setActivePopout(null); }}
                  style={{
                    display: 'block', width: '100%',
                    padding: '8px 10px', borderRadius: 8,
                    border: '1px solid #bfdbfe', background: '#eff6ff',
                    color: '#1d4ed8', fontSize: 12, fontWeight: 600,
                    textAlign: 'left', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
                >
                  All departments
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: '#3b82f6', marginTop: 2 }}>
                    Entire flyer template
                  </span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Icon toolbar strip */}
      <div
        ref={toolbarRef}
        data-keep-selection="true"
        onMouseDown={(e) => e.stopPropagation()}
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
      >
        {/* Section label */}
        <div style={{
          textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#6b7280',
          letterSpacing: '0.06em', padding: '2px 0 4px',
        }}>
          {activeSection === 'title' ? 'TITLE' : 'PRICE'}
        </div>

        <Divider />

        {/* Font */}
        <Btn
          title={`Font: ${activeFontLabel}`}
          icon={<FontIcon />}
          active={activePopout === 'font'}
          modified={!!font}
          onClick={() => setActivePopout(prev => prev === 'font' ? null : 'font')}
        />

        {/* Color — inline color swatch that opens native picker */}
        <label
          title="Text color"
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: 36, height: 36, borderRadius: 8,
            border: '1.5px solid transparent',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, position: 'relative',
          }}
        >
          <div style={{
            width: 22, height: 22, borderRadius: 5,
            background: color, border: '1px solid rgba(0,0,0,0.15)',
            pointerEvents: 'none',
          }} />
          <input
            type="color"
            value={color}
            onChange={e => onColorChange(e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
          />
        </label>

        {/* Italic (title only) — styled with live title color + font as preview */}
        {isTitle && (
          <Btn
            title="Italic"
            icon={
              <span style={{
                fontStyle: 'italic',
                fontFamily: titleFont || 'Georgia, serif',
                fontWeight: 700,
                fontSize: 15,
                color: titleItalic ? titleColor : undefined,
              }}>
                I
              </span>
            }
            active={!!titleItalic}
            onClick={onTitleItalicToggle}
          />
        )}

        {/* Dollar sign toggle (price only) — styled with live price color + font as preview */}
        {!isTitle && (
          <Btn
            title="Show dollar sign"
            icon={
              <span style={{
                fontWeight: 700,
                fontSize: 15,
                fontFamily: priceFont || undefined,
                color: priceShowDollar ? priceColor : undefined,
              }}>
                $
              </span>
            }
            active={!!priceShowDollar}
            onClick={onShowDollarToggle}
          />
        )}

        <Divider />

        {/* Effect */}
        <Btn
          title={effect ? `Effect: ${effect}` : 'Text Effect'}
          icon={<EffectIcon />}
          active={activePopout === 'effect'}
          modified={!!effect}
          onClick={() => setActivePopout(prev => prev === 'effect' ? null : 'effect')}
        />

        {/* Component layout editor */}
        <Btn
          title="Edit component sizes & positions"
          icon={<SlidersIcon />}
          onClick={onOpenComponentEditor}
        />

        {(onApplyToDepartment || onApplyGlobally) && (
          <Btn
            title="Apply style to all text fields"
            icon={<ApplyIcon />}
            active={activePopout === 'apply'}
            onClick={() => setActivePopout(prev => prev === 'apply' ? null : 'apply')}
          />
        )}

        <Divider />

        {/* Close */}
        <button
          title="Close text toolbar"
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: 36, height: 36, border: '1.5px solid transparent', borderRadius: 8,
            background: 'transparent', color: '#9ca3af', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    </>
  );
}
