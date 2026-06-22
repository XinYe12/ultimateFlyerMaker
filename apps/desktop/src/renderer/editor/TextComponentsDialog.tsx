// FILE: apps/desktop/src/renderer/editor/TextComponentsDialog.tsx
// Modal dialog for fine-tuning individual sub-component sizes and offsets of price/title labels.

import React from 'react';

type TextEffect = 'stroke' | 'glow' | 'shadow';

function parsePriceDisplay(display: string) {
  const multiBuyMatch = display.match(/^(\d+)\s+FOR\s+\$?([\d.]+)/i);
  if (multiBuyMatch) {
    const [intPart, decPart = ""] = multiBuyMatch[2].split(".");
    return { type: "MULTI" as const, quantity: multiBuyMatch[1], integer: intPart, decimal: decPart, unit: "" };
  }
  const singleMatch = display.match(/\$?([\d.]+)(?:\/(\w+))?/i);
  if (singleMatch) {
    const [intPart, decPart = ""] = singleMatch[1].split(".");
    return { type: "SINGLE" as const, quantity: null, integer: intPart, decimal: decPart, unit: singleMatch[2] || "" };
  }
  return null;
}

function buildEffect(effect: TextEffect | undefined, color: string | undefined, size: number): React.CSSProperties {
  if (!effect || !color) return {};
  if (effect === 'stroke') return { WebkitTextStroke: `${size}px ${color}` } as React.CSSProperties;
  if (effect === 'glow') return { textShadow: `0 0 ${size}px ${color}, 0 0 ${size * 2}px ${color}` };
  return { textShadow: `${size}px ${size}px ${Math.ceil(size * 0.8)}px ${color}` };
}

export interface PriceCompValues {
  dollarRatio: number;
  dollarOffsetY: number;
  qtyRatio: number;
  decRatio: number;
  decOffsetY: number;
  unitRatio: number;
  unitOffsetY: number;
}

export const PRICE_COMP_DEFAULTS: PriceCompValues = {
  dollarRatio: 0.35,
  dollarOffsetY: 0,
  qtyRatio: 0.55,
  decRatio: 0.50,
  decOffsetY: 0,
  unitRatio: 0.12,
  unitOffsetY: 0,
};

export interface TitleCompValues {
  metaScale: number;
  metaOffsetY: number;
}

export const TITLE_COMP_DEFAULTS: TitleCompValues = {
  metaScale: 1.0,
  metaOffsetY: 0,
};

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  hasOffset?: boolean;
  offsetVal?: number;
  onOffsetChange?: (v: number) => void;
  defaultVal: number;
  defaultOffset?: number;
}

function SliderRow({ label, value, min, max, step, unit = '%', onChange, hasOffset, offsetVal, onOffsetChange, defaultVal, defaultOffset = 0 }: SliderRowProps) {
  const isModified = value !== defaultVal || (hasOffset && (offsetVal ?? 0) !== defaultOffset);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '120px 1fr 64px 84px 26px',
      gap: 8,
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: '1px solid #f3f4f6',
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</span>

      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <input
          type="number"
          value={value}
          min={min} max={max} step={step}
          onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
          style={{
            width: 42, height: 24, border: '1px solid #d1d5db', borderRadius: 5,
            fontSize: 11, textAlign: 'center', padding: '0 2px',
          }}
        />
        <span style={{ fontSize: 10, color: '#9ca3af' }}>{unit}</span>
      </div>

      {hasOffset ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>Y:</span>
          <input
            type="number"
            value={offsetVal ?? 0}
            min={-100} max={100} step={1}
            onChange={e => onOffsetChange?.(Number(e.target.value))}
            style={{
              width: 44, height: 24, border: '1px solid #d1d5db', borderRadius: 5,
              fontSize: 11, textAlign: 'center', padding: '0 2px',
            }}
          />
        </div>
      ) : <div />}

      <button
        onClick={() => { onChange(defaultVal); if (hasOffset) onOffsetChange?.(defaultOffset); }}
        title="Reset to default"
        style={{
          width: 24, height: 24, border: 'none',
          background: isModified ? '#fee2e2' : '#f3f4f6',
          borderRadius: 5, cursor: 'pointer', fontSize: 13,
          color: isModified ? '#ef4444' : '#9ca3af',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}
      >↺</button>
    </div>
  );
}

interface Props {
  section: 'title' | 'price';
  // Price
  priceDisplay: string;
  priceShowDollar: boolean;
  priceFont?: string;
  priceColor?: string;
  priceEffect?: TextEffect;
  priceEffectColor?: string;
  priceEffectSize?: number;
  priceCompValues: PriceCompValues;
  onPriceCompChange: (patch: Partial<PriceCompValues>) => void;
  // Title
  titleSampleText?: string;
  titleSampleMeta?: string;
  titleFont?: string;
  titleColor?: string;
  titleItalic?: boolean;
  titleCompValues: TitleCompValues;
  onTitleCompChange: (patch: Partial<TitleCompValues>) => void;
  onClose: () => void;
}

export default function TextComponentsDialog({
  section,
  priceDisplay,
  priceShowDollar,
  priceFont,
  priceColor = '#000000',
  priceEffect,
  priceEffectColor,
  priceEffectSize = 2,
  priceCompValues: pv,
  onPriceCompChange,
  titleSampleText = 'ORGANIC APPLES',
  titleSampleMeta = '3 lb bag  /  REG $5.99',
  titleFont,
  titleColor = '#000000',
  titleItalic,
  titleCompValues: tv,
  onTitleCompChange,
  onClose,
}: Props) {
  const isPrice = section === 'price';
  const pp = parsePriceDisplay(priceDisplay);

  // Preview sizes — use same ratios as RenderFlyerPlacements
  const PREV_MAIN = 76;
  const PREV_SCALE = PREV_MAIN / 100;
  // priceTextStyle mirrors RenderFlyerPlacements: font/color/effect only, no fontWeight (CSS class handles that)
  const priceTextStyle: React.CSSProperties = {
    ...(priceFont ? { fontFamily: priceFont } : {}),
    color: priceColor,
    ...buildEffect(priceEffect, priceEffectColor, priceEffectSize),
  };
  const prevDollarSize = Math.round(PREV_MAIN * pv.dollarRatio);
  const prevDollarTop  = -Math.round(PREV_MAIN * 0.44) + pv.dollarOffsetY * PREV_SCALE;
  const prevQtySize    = Math.round(PREV_MAIN * pv.qtyRatio);
  const prevDecSize    = Math.round(PREV_MAIN * pv.decRatio);
  const prevDecTop     = -Math.round(PREV_MAIN * 0.20) + pv.decOffsetY * PREV_SCALE;
  const prevUnitSize   = Math.round(PREV_MAIN * pv.unitRatio);

  const PREV_TITLE_MAIN = 22;
  const prevMetaSize = Math.round(PREV_TITLE_MAIN * 0.75 * tv.metaScale);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 20000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          width: 560,
          maxHeight: '88vh',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid #f3f4f6', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
            {isPrice ? 'Price Label Components' : 'Title Components'}
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, border: 'none', background: '#f3f4f6',
              borderRadius: 6, cursor: 'pointer', fontSize: 18, color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Live preview */}
        <div style={{
          padding: '20px 18px 18px',
          background: '#f9fafb',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 120,
          flexShrink: 0,
        }}>
          {isPrice ? (
            pp ? (
              // Mirror exact structure of RenderFlyerPlacements patterns 2/3 so styles match 1-to-1
              <div className="ufm-price" style={{ display: 'flex', alignItems: 'baseline' }}>
                {pp.type === 'MULTI' && (
                  <span className="ufm-price-qty" style={{ fontSize: prevQtySize, marginRight: 0, ...priceTextStyle }}>{pp.quantity}/</span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                  {priceShowDollar && (
                    <span style={{ fontSize: prevDollarSize, paddingRight: 2, lineHeight: 1, position: 'relative', top: prevDollarTop, ...priceTextStyle }}>$</span>
                  )}
                  <span className="ufm-price-main" style={{ fontSize: PREV_MAIN, ...priceTextStyle }}>{pp.integer}</span>
                </span>
                {(pp.decimal || (pp.type === 'SINGLE' && pp.unit)) && (
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', position: 'relative', top: prevDecTop, lineHeight: 1.1 }}>
                    {pp.decimal && (
                      <span className="ufm-price-decimal" style={{ fontSize: prevDecSize, ...priceTextStyle }}>{pp.decimal}</span>
                    )}
                    {pp.type === 'SINGLE' && pp.unit && (
                      <span className="ufm-price-unit" style={{ fontSize: prevUnitSize, marginTop: pv.unitOffsetY * PREV_SCALE, ...priceTextStyle }}>/{pp.unit.toUpperCase()}</span>
                    )}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ color: '#9ca3af', fontSize: 13 }}>No price to preview</span>
            )
          ) : (
            <div className="ufm-title" style={{ textAlign: 'center', margin: 0 }}>
              <div className="ufm-title-main" style={{
                ...(titleFont ? { fontFamily: titleFont } : {}),
                fontSize: PREV_TITLE_MAIN, color: titleColor,
                fontStyle: titleItalic ? 'italic' : 'normal',
              }}>{titleSampleText}</div>
              {titleSampleMeta && (
                <div className="ufm-title-meta" style={{
                  ...(titleFont ? { fontFamily: titleFont } : {}),
                  fontSize: prevMetaSize, color: titleColor,
                  marginTop: 2 + tv.metaOffsetY * 0.4,
                }}>{titleSampleMeta}</div>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ padding: '10px 18px 6px', flex: 1 }}>
          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '120px 1fr 64px 84px 26px',
            gap: 8,
            padding: '4px 0 6px',
            borderBottom: '2px solid #f3f4f6',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Component</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Size</span>
            <span />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Y Offset</span>
            <span />
          </div>

          {isPrice && pp ? (
            <>
              {/* Integer — reference only */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: 8, alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #f3f4f6',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                  Integer "{pp.integer}"
                </span>
                <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                  Use drag handles on canvas to resize
                </span>
              </div>

              {priceShowDollar && (
                <SliderRow
                  label='$ Sign'
                  value={Math.round(pv.dollarRatio * 100)}
                  min={10} max={70} step={1}
                  onChange={v => onPriceCompChange({ dollarRatio: v / 100 })}
                  hasOffset offsetVal={pv.dollarOffsetY}
                  onOffsetChange={v => onPriceCompChange({ dollarOffsetY: v })}
                  defaultVal={35} defaultOffset={0}
                />
              )}

              {pp.type === 'MULTI' && (
                <SliderRow
                  label={`Qty "${pp.quantity}/"`}
                  value={Math.round(pv.qtyRatio * 100)}
                  min={20} max={100} step={1}
                  onChange={v => onPriceCompChange({ qtyRatio: v / 100 })}
                  defaultVal={55}
                />
              )}

              {pp.decimal && (
                <SliderRow
                  label={`Decimal "${pp.decimal}"`}
                  value={Math.round(pv.decRatio * 100)}
                  min={20} max={100} step={1}
                  onChange={v => onPriceCompChange({ decRatio: v / 100 })}
                  hasOffset offsetVal={pv.decOffsetY}
                  onOffsetChange={v => onPriceCompChange({ decOffsetY: v })}
                  defaultVal={50} defaultOffset={0}
                />
              )}

              {pp.type === 'SINGLE' && pp.unit && (
                <SliderRow
                  label={`Unit "/${pp.unit.toUpperCase()}"`}
                  value={Math.round(pv.unitRatio * 100)}
                  min={5} max={30} step={1}
                  onChange={v => onPriceCompChange({ unitRatio: v / 100 })}
                  hasOffset offsetVal={pv.unitOffsetY}
                  onOffsetChange={v => onPriceCompChange({ unitOffsetY: v })}
                  defaultVal={12} defaultOffset={0}
                />
              )}
            </>
          ) : !isPrice ? (
            <>
              <div style={{
                display: 'grid', gridTemplateColumns: '120px 1fr',
                gap: 8, alignItems: 'center',
                padding: '8px 0', borderBottom: '1px solid #f3f4f6',
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Main Text</span>
                <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                  Use drag handles on canvas to resize
                </span>
              </div>
              <SliderRow
                label="Meta Line"
                value={Math.round(tv.metaScale * 100)}
                min={40} max={200} step={1} unit="%"
                onChange={v => onTitleCompChange({ metaScale: v / 100 })}
                hasOffset offsetVal={tv.metaOffsetY}
                onOffsetChange={v => onTitleCompChange({ metaOffsetY: v })}
                defaultVal={100} defaultOffset={0}
              />
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 18px', borderTop: '1px solid #f3f4f6', flexShrink: 0,
        }}>
          <button
            onClick={() => {
              if (isPrice) onPriceCompChange({ ...PRICE_COMP_DEFAULTS });
              else onTitleCompChange({ ...TITLE_COMP_DEFAULTS });
            }}
            style={{
              height: 30, padding: '0 14px', borderRadius: 7,
              border: '1px solid #d1d5db', background: '#f9fafb',
              color: '#374151', fontSize: 12, cursor: 'pointer',
            }}
          >Reset All</button>
          <button
            onClick={onClose}
            style={{
              height: 30, padding: '0 20px', borderRadius: 7,
              border: 'none', background: '#2563eb',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >Done</button>
        </div>
      </div>
    </div>
  );
}
