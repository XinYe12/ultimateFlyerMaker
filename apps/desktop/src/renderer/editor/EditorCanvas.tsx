// FILE: apps/desktop/src/renderer/editor/EditorCanvas.tsx
// ROLE: render ONLY based on template config (authoritative)

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  loadFlyerTemplateConfig,
  findPageForDepartment,
  findDepartmentArea,
  CardStyleDef,
} from "./loadFlyerTemplateConfig";
import RenderFlyerPlacements from "./RenderFlyerPlacements";
import SlotOverlays from "./SlotOverlays";
import AddImageModal from "./AddImageModal";
import type { PanelImageDropHandler } from "./panelImageDrag";
import { computeTextNudgePatch, TEXT_NUDGE_STEP, TEXT_NUDGE_STEP_FAST } from "./textElementNudge";
import { layoutFlyer, layoutFlyerSlots } from "../../../../shared/flyer/layout/layoutFlyer";
import { isSlottedDepartment, isCardDepartment } from "./loadFlyerTemplateConfig";
import { layoutCardRows, computeCardRects, deriveRowCount, resolveLayoutRows, resolveLayoutRowsForRendering, CARD_GAP, DEFAULT_CELL_GAP, CARD_BG } from "../../../../shared/flyer/layout/layoutCardRows";

import { IngestItem, CardDef, CardLayout, ReplacementJob, AddProductFormMeta } from "../types";
import MergeSelectionDialog, { MergeCandidate } from "./MergeSelectionDialog";
import TextSideToolbar from "./TextSideToolbar";
import { applyTextStylePatch, textStylePatchFromCard, type TextFieldSection } from "./textFieldStyle";
import TextComponentsDialog, { PriceCompValues, TitleCompValues, PRICE_COMP_DEFAULTS, TITLE_COMP_DEFAULTS } from "./TextComponentsDialog";
import CutoutEraserModal from "./CutoutEraserModal";
import ImageToolbar, { ImageToolbarPatch } from "./ImageToolbar";

const BASE_PREVIEW_SCALE = 0.5;
const MIN_CARD_WIDTH = 150;

type SlotRect = { x: number; y: number; width: number; height: number };

type GroupDivider = {
  leftCardIds: string[];
  rightCardIds: string[];
  x: number;      // center of the gap (absolute pixels)
  y: number;      // top of combined row range (absolute pixels)
  height: number; // full height of combined row range
};


function getItemPriceDisplay(item: any): string {
  const rawSaleFromDiscount = item?.result?.discount?.price ?? item?.result?.discount?.display;
  const saleFromDiscount =
    rawSaleFromDiscount != null && typeof rawSaleFromDiscount === "object"
      ? rawSaleFromDiscount.display
      : rawSaleFromDiscount;

  if (saleFromDiscount != null && String(saleFromDiscount).trim() !== "") {
    const s = String(saleFromDiscount).trim();
    if (s.startsWith("$") || /FOR/i.test(s) || s.includes("/")) return s;
    return `$${s}`;
  }

  const llmItem = item?.result?.llmResult?.items?.[0];
  const llmSalePrice = llmItem?.sale_price;
  if (llmSalePrice != null) {
    const qty = Number(llmItem?.quantity);
    const rawPrice = parseFloat(String(llmSalePrice)).toFixed(2);
    return qty > 1 ? `${qty} FOR $${rawPrice}` : `$${rawPrice}`;
  }

  return "";
}

export default function EditorCanvas({
  editorQueue,
  templateId,
  department,
  discountLabels,
  isLocked,
  onEnqueue,
  onRemove,
  onReplaceImage,
  onRemoveItem,
  onChooseDatabaseResults,
  onGoogleSearch,
  onEditTitle,
  onEditBannerDays,
  onPickSeriesFlavors,
  onAddItem,
  slotOverrides,
  onSlotOverridesChange,
  cardLayout,
  onCardLayoutChange,
  onRemoveFromQueue,
  rowCount,
  onRowCountChange,
  editMode,
  onSubImageUpdate,
  onDeleteSubImage,
  onCutoutErased,
  flyerWeekStart,
  replacementJobs,
  onCancelReplacementJob,
  onEnqueueAddProduct,
  onEnqueueAddProductSeries,
  selectedItemId,
  onSelectItem,
  onPanelImageDrop,
  onApplyTextStyleGlobally,
  onHistoryCommit,
  departmentLabel,
  zoom,
}: {
  editorQueue: any[];
  templateId: string;
  department: string;
  discountLabels?: {
    id: string;
    title?: { en: string; zh: string; size: string; regularPrice: string };
    price?: { display: string; quantity?: number | null; unit?: string; regular?: string; days?: string[] };
  }[];
  flyerWeekStart?: string;
  isLocked?: boolean;
  onEnqueue?: (paths: string[], options?: { slotIndex?: number }) => Promise<void>;
  onRemove?: (id: string) => void;
  onReplaceImage?: (itemId: string) => Promise<void>;
  onRemoveItem?: (id: string) => void;
  onChooseDatabaseResults?: (itemId: string) => void;
  onGoogleSearch?: (itemId: string) => void;
  onEditTitle?: (itemId: string) => void;
  onEditBannerDays?: (itemId: string) => void;
  onPickSeriesFlavors?: (itemId: string) => void;
  onAddItem?: (item: IngestItem) => void;
  slotOverrides?: Record<number, SlotRect>;
  onSlotOverridesChange?: (overrides: Record<number, SlotRect>) => void;
  cardLayout?: CardLayout | null;
  onCardLayoutChange?: (layout: CardLayout) => void;
  onRemoveFromQueue?: (id: string) => void;
  rowCount?: number;
  onRowCountChange?: (rows: number) => void;
  editMode?: boolean;
  onSubImageUpdate?: (itemId: string, subIdx: number, patch: { scale?: number; rotation?: number; x?: number; y?: number; cropLeft?: number; cropRight?: number; cropTop?: number; cropBottom?: number }) => void;
  onDeleteSubImage?: (itemId: string, subIdx: number) => void;
  onCutoutErased?: (itemId: string, newPath: string) => void;
  replacementJobs?: ReplacementJob[];
  onCancelReplacementJob?: (jobId: string) => void;
  onEnqueueAddProduct?: (
    url: string,
    options: { slotIndex?: number; cardId?: string; formMeta?: AddProductFormMeta },
  ) => string;
  onEnqueueAddProductSeries?: (
    urls: string[],
    options: { slotIndex?: number; cardId?: string; formMeta?: AddProductFormMeta },
  ) => string;
  selectedItemId?: string | null;
  onSelectItem?: (id: string | null) => void;
  onPanelImageDrop?: PanelImageDropHandler;
  onApplyTextStyleGlobally?: (section: TextFieldSection, patch: Partial<CardDef>) => void;
  onHistoryCommit?: (label: string, departments?: string[]) => void;
  departmentLabel?: string;
  zoom?: number;
}) {
  const PREVIEW_SCALE = BASE_PREVIEW_SCALE * (zoom ?? 1);
  const [config, setConfig] = useState<any | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [addImageModalSlot, setAddImageModalSlot] = useState<number | null>(null);
  const [addImageModalCardId, setAddImageModalCardId] = useState<string | null>(null);
  const [addProductSessionItemIds, setAddProductSessionItemIds] = useState<Set<string>>(new Set());
  const [eraserItemId, setEraserItemId] = useState<string | null>(null);
  // load template config (only when template changes, not on every dept switch)
  useEffect(() => {
    loadFlyerTemplateConfig(templateId).then(cfg => {
      setConfig(cfg);
    });
  }, [templateId]);

  // derive canvas size from config + department (no null flash between dept switches)
  useEffect(() => {
    if (!config) return;
    const p = config.pages.find((pg: any) => pg.departments && pg.departments[department]);
    if (p && !p.imagePath && p.canvasWidth && p.canvasHeight) {
      setImageSize({ width: p.canvasWidth, height: p.canvasHeight });
    } else if (p?.imagePath) {
      // Do NOT null out imageSize here. On same-page department switches, pageId/imagePath
      // stay the same, so img onLoad won't re-fire; clearing imageSize would blank the canvas.
    } else {
      setImageSize(null);
    }
  }, [config, department]);

  // editorQueue is already glued content
  const items = editorQueue;
  const itemsRef = useRef(items);
  itemsRef.current = items;


  // Keep a ref to onReplaceImage so the IPC handler always uses the latest version
  // without capturing a potentially-uninitialized handleReplaceImage (defined after early return)
  const onReplaceImageRef = useRef(onReplaceImage);
  onReplaceImageRef.current = onReplaceImage;

  useEffect(() => {
    const unsub = (window as any).ufm.onContextMenuAction(({ itemId, action }: { itemId: string; action: string }) => {
      if (action === 'editTitle') onEditTitle?.(itemId);
      else if (action === 'googleSearch') onGoogleSearch?.(itemId);
      else if (action === 'dbResults') onChooseDatabaseResults?.(itemId);
      else if (action === 'uploadLocal') onReplaceImageRef.current?.(itemId);
      else if (action === 'flavors') onPickSeriesFlavors?.(itemId);
      else if (action === 'editCutout') setEraserItemId(itemId);
      else if (action === 'openSource') {
        const it = items.find((it: any) => it.id === itemId);
        const url = it?.result?.sourceUrl;
        if (url) (window as any).ufm.openExternal(url);
      }
      else if (action === 'showInFolder') {
        const it = items.find((it: any) => it.id === itemId);
        const filePath = it?.result?.inputPath ?? it?.path ?? null;
        if (filePath) (window as any).ufm.showItemInFolder(filePath);
      }
    });
    return unsub;
  }, [onEditTitle, onGoogleSearch, onChooseDatabaseResults, onPickSeriesFlavors]);

  // Maps itemId → normalized display src of the specific image being rerun.
  // This lets us freeze only that one image in a multi-flavor grid.
  const [rerunningCutoutMap, setRerunningCutoutMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const clearId = (id: string) =>
      setRerunningCutoutMap(prev => { const m = new Map(prev); m.delete(id); return m; });
    const unsubOk  = (window as any).ufm.onCutoutComplete((data: { id: string; cutoutPath: string }) => {
      clearId(data.id);
      if (data.cutoutPath) onCutoutErased?.(data.id, data.cutoutPath);
    });
    const unsubErr = (window as any).ufm.onCutoutError?.((data: { id: string; error: string }) => {
      clearId(data.id);
    });
    return () => { unsubOk?.(); unsubErr?.(); };
  }, [onCutoutErased]);

  const page = config ? findPageForDepartment(config, department) : null;
  const region = page?.departments?.[department] ?? null;
  const departmentArea = config ? findDepartmentArea(config, department) : null;
  const templateCardStyle: CardStyleDef | undefined = departmentArea?.cardStyle;
  const imagePath = page?.imagePath ?? "";

  const isCard = region ? isCardDepartment(region) : false;
  const isSlotted = region ? isSlottedDepartment(region) : false;

  const selectedCard = useMemo(
    () => (isCard && cardLayout ? cardLayout.find(c => c.itemId === selectedItemId) ?? null : null),
    [isCard, cardLayout, selectedItemId],
  );

  const handleUpdateSelectedCard = useCallback((patch: Partial<CardDef>) => {
    if (!selectedItemId || !cardLayout || !onCardLayoutChange) return;
    onCardLayoutChange(cardLayout.map(c => c.itemId === selectedItemId ? { ...c, ...patch } : c));
  }, [selectedItemId, cardLayout, onCardLayoutChange]);

  const handleRerunCutout = useCallback((model: string) => {
    if (!selectedItemId) return;
    const item = items.find((it: any) => it.id === selectedItemId);
    const originalPath = item?.result?.inputPath ?? item?.path ?? null;
    if (!originalPath) return;

    // Resolve the currently displayed local path (what the user sees in the card).
    // Web URLs (Firebase Storage) are not usable as local paths — fall back to originalPath.
    const currentCutoutRaw = item?.result?.cutoutPaths?.[0] ?? item?.result?.cutoutPath ?? null;
    const displayedLocalPath = (currentCutoutRaw && !String(currentCutoutRaw).startsWith('http'))
      ? (currentCutoutRaw.startsWith('file://') ? currentCutoutRaw.slice(7) : currentCutoutRaw)
      : null;

    // ML models fail when fed a fully-processed cutout PNG (transparent bg composited over white
    // makes product-white indistinguishable from background → product disappears).
    // Fully-processed cutouts match *.cutout[.shadow].png. User-erased files (*.erased-NNN.png)
    // are only partially transparent and are safe to feed to ML.
    const isFullCutout = Boolean(displayedLocalPath &&
      /\.cutout(?:\.shadow)?\.png$/i.test(displayedLocalPath));
    const isML = !['border-trim', 'contour-bg'].includes(model);

    const currentPath = (isML && isFullCutout)
      ? originalPath
      : (displayedLocalPath ?? originalPath);

    const displaySrc = currentPath.startsWith("http") || currentPath.startsWith("file://")
      ? currentPath : `file://${currentPath}`;
    setRerunningCutoutMap(prev => new Map(prev).set(selectedItemId, displaySrc));
    (window as any).ufm.rerunCutout(selectedItemId, currentPath, model);
  }, [selectedItemId, items]);


  // ── Slot drag/resize state (for slot-based departments) ──
  const [activeDrag, setActiveDrag] = useState<{
    slotIndex: number;
    type: 'move' | 'resize';
    corner?: 'tl' | 'tr' | 'bl' | 'br';
    startMouseX: number;
    startMouseY: number;
    startRect: SlotRect;
    thresholdMet: boolean;
  } | null>(null);

  const [liveSlotOverride, setLiveSlotOverride] = useState<{
    slotIndex: number;
    rect: SlotRect;
  } | null>(null);

  // ── Card divider drag state ──
  const [dividerDrag, setDividerDrag] = useState<{
    leftCardId: string;
    rightCardId: string;
    startX: number;
    leftStartWidth: number;
    rightStartWidth: number;
    /** Snapshot taken at drag start — used to roll back if the gesture turns out to be a click */
    originalLayout: CardLayout;
    /** Set when drag was initiated from the merge button; if the mouse barely moved, execute merge instead */
    mergeIds?: { leftCardIds: string[]; rightCardIds: string[] };
  } | null>(null);

  // ── Per-element scale drag state ──
  const [elementScaleDrag, setElementScaleDrag] = useState<{
    itemId: string;
    type: 'image' | 'title' | 'price';
    corner: 'tl' | 'tr' | 'bl' | 'br';
    startX: number;
    startY: number;
    startScale: number;
  } | null>(null);

  // ── Per-element rotate drag state ──
  const [elementRotateDrag, setElementRotateDrag] = useState<{
    itemId: string;
    centerX: number;     // image center in screen coords
    centerY: number;
    startAngle: number;  // atan2(mouseY - centerY, mouseX - centerX) at drag start
    startRotation: number;
  } | null>(null);

  // ── Per-sub-image scale drag state ──
  const [subImageScaleDrag, setSubImageScaleDrag] = useState<{
    itemId: string;
    subIdx: number;
    corner: 'tl' | 'tr' | 'bl' | 'br';
    startX: number;
    startY: number;
    startScale: number;
  } | null>(null);

  // ── Per-sub-image rotate drag state ──
  const [subImageRotateDrag, setSubImageRotateDrag] = useState<{
    itemId: string;
    subIdx: number;
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
  } | null>(null);

  // ── Image pan drag state ──
  const [imagePanDrag, setImagePanDrag] = useState<{
    itemId: string;
    startX: number; startY: number;
    startOffsetX: number; startOffsetY: number;
  } | null>(null);

  // ── Price vertical pan drag state ──
  const [pricePanDrag, setPricePanDrag] = useState<{
    itemId: string;
    startY: number;
    startOffsetY: number;
  } | null>(null);

  // ── Active toolbar section (set when user clicks title/price/banner element) ──
  const [activeToolbarSection, setActiveToolbarSection] = useState<'title' | 'price' | 'banner' | null>(null);
  const [showTextCompDialog, setShowTextCompDialog] = useState(false);

  // ── Banner pan drag state ──
  const [bannerPanDrag, setBannerPanDrag] = useState<{
    itemId: string;
    startX: number; startY: number;
    startOffsetX: number; startOffsetY: number;
  } | null>(null);

  // ── Sub-image pan drag state ──
  const [subImagePanDrag, setSubImagePanDrag] = useState<{
    itemId: string; subIdx: number;
    startX: number; startY: number;
    startOffsetX: number; startOffsetY: number;
  } | null>(null);

  // ── Crop drag state ──
  const [cropDrag, setCropDrag] = useState<{
    itemId: string;
    side: 'left' | 'right' | 'top' | 'bottom';
    startX: number; startY: number;
    startValue: number;
    cardWidth: number; cardHeight: number;
  } | null>(null);

  // ── Sub-image crop drag state (for multi-buy / multi-flavor) ──
  const [subImageCropDrag, setSubImageCropDrag] = useState<{
    itemId: string;
    subIdx: number;
    side: 'left' | 'right' | 'top' | 'bottom';
    startX: number; startY: number;
    startValue: number;
    imgWidth: number; imgHeight: number;
  } | null>(null);

  // ── Merge state ──
  const [mergeDialog, setMergeDialog] = useState<{
    candidates: MergeCandidate[];
    onConfirm: (keepItemId: string) => void;
  } | null>(null);

  const [hoveredHMerge, setHoveredHMerge] = useState<number | null>(null);
  /** Set by the divider mouseup handler when a tiny-movement "click" on the merge button is detected */
  const [pendingClickMerge, setPendingClickMerge] = useState<{ leftCardIds: string[]; rightCardIds: string[] } | null>(null);

  // ── Swap drag state ──
  const scaledCanvasRef = useRef<HTMLDivElement>(null);
  const holdPendingRef = useRef<{
    cardId: string;
    startX: number;
    startY: number;
  } | null>(null);
  const [swapDrag, setSwapDrag] = useState<{
    cardId: string;
    x: number;         // screen coords
    y: number;
    targetCardId: string | null;
  } | null>(null);
  // Refs synced in render body — always current in global event handlers
  const swapDragRef = useRef(swapDrag);
  swapDragRef.current = swapDrag;
  const cardLayoutRef = useRef(cardLayout ?? null);
  cardLayoutRef.current = cardLayout ?? null;
  const onCardLayoutChangeRef = useRef(onCardLayoutChange);
  onCardLayoutChangeRef.current = onCardLayoutChange;

  // Compute effective slots = template slots merged with saved overrides + live drag
  const effectiveSlots = useMemo(() => {
    if (!region || !isSlottedDepartment(region)) return [];
    return region.slots.map((slot: SlotRect, i: number) => {
      const saved = slotOverrides?.[i];
      let result = saved ? { ...slot, ...saved } : { ...slot };
      if (liveSlotOverride?.slotIndex === i) {
        result = { ...result, ...liveSlotOverride.rect };
      }
      return result;
    });
  }, [region, slotOverrides, liveSlotOverride]);

  // Card placements (for card-based departments)
  const layoutRows = useMemo(() => {
    if (!region || !isCardDepartment(region)) return undefined;
    return resolveLayoutRowsForRendering(
      cardLayout ?? [],
      rowCount,
      departmentArea?.rows ?? region.rows,
    );
  }, [region, rowCount, departmentArea, cardLayout]);

  // Exposed so card backgrounds and region background can share the same reference
  const cardRegion: { x: number; y: number; width: number; height: number } | null =
    region && isCardDepartment(region) ? region.region : null;

  // Apply uniform insets: padding from region edge = DEFAULT_CELL_GAP (all four sides equal, all departments).
  const innerCardRegion = useMemo(() => {
    if (!cardRegion) return null;
    return {
      x: cardRegion.x + DEFAULT_CELL_GAP,
      y: cardRegion.y + DEFAULT_CELL_GAP,
      width: Math.max(1, cardRegion.width - 2 * DEFAULT_CELL_GAP),
      height: Math.max(1, cardRegion.height - 2 * DEFAULT_CELL_GAP),
    };
  }, [cardRegion]);

  const innerCardCellGap = DEFAULT_CELL_GAP;

  // Scale card widths proportionally when x-axis insets shrink the effective region
  const innerCardLayout = useMemo(() => {
    if (!cardLayout || !innerCardRegion || !cardRegion) return cardLayout;
    if (innerCardRegion.width === cardRegion.width) return cardLayout;
    const scale = innerCardRegion.width / cardRegion.width;
    return cardLayout.map(card => ({
      ...card,
      widthPx: Math.max(1, Math.round(card.widthPx * scale)),
    }));
  }, [cardLayout, innerCardRegion, cardRegion]);

  const cardPlacements = useMemo(() => {
    if (!page || !region || !isCard || !innerCardLayout || innerCardLayout.length === 0) return [];
    return layoutCardRows({
      cards: innerCardLayout,
      region: innerCardRegion!,
      rows: layoutRows,
      gap: innerCardCellGap,
      pageId: page.pageId,
      regionId: department,
    });
  }, [page, region, isCard, innerCardLayout, innerCardRegion, innerCardCellGap, department, layoutRows]);

  // Card rects (for rendering backgrounds of all cards including empty)
  const cardRects = useMemo(() => {
    if (!region || !isCard || !innerCardLayout || innerCardLayout.length === 0) return [];
    return computeCardRects({ cards: innerCardLayout, region: innerCardRegion!, rows: layoutRows, gap: innerCardCellGap });
  }, [region, isCard, innerCardLayout, layoutRows, innerCardRegion, innerCardCellGap]);
  const cardRectsRef = useRef(cardRects);
  cardRectsRef.current = cardRects;

  const cardClipStyle = useMemo((): React.CSSProperties | undefined => {
    if (!region || !isCardDepartment(region) || !imageSize || !cardRegion) return undefined;
    return {
      position: "absolute",
      left: 0,
      top: 0,
      width: imageSize.width,
      height: imageSize.height,
      clipPath: `inset(${cardRegion.y}px ${Math.max(0, imageSize.width - cardRegion.x - cardRegion.width)}px ${Math.max(0, imageSize.height - cardRegion.y - cardRegion.height)}px ${cardRegion.x}px)`,
    };
  }, [region, imageSize, cardRegion]);

  // Slot-based placements
  const slotPlacements = useMemo(() => {
    if (!page || !region || items.length === 0) return [];

    if (isSlotted) {
      return layoutFlyerSlots({
        items,
        pageId: page.pageId,
        regionId: department,
        slots: effectiveSlots,
      });
    }

    if (!isCard) {
      return layoutFlyer({
        items,
        pageId: page.pageId,
        region: {
          id: department,
          x: (region as any).x,
          y: (region as any).y,
          width: (region as any).width,
          height: (region as any).height,
        },
      });
    }

    return [];
  }, [page, region, items, department, effectiveSlots, isSlotted, isCard]);

  // Decide which placements to use
  const placements = isCard ? cardPlacements : slotPlacements;

  // Slot drag start (move)
  const handleSlotDragStart = useCallback((slotIndex: number, e: React.MouseEvent) => {
    if (!onSlotOverridesChange) return;
    const slot = effectiveSlots[slotIndex];
    if (!slot) return;
    e.preventDefault();
    setActiveDrag({
      slotIndex,
      type: 'move',
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startRect: { x: slot.x, y: slot.y, width: slot.width, height: slot.height },
      thresholdMet: false,
    });
  }, [effectiveSlots, onSlotOverridesChange]);

  // Slot resize start
  const handleSlotResizeStart = useCallback((slotIndex: number, corner: string, e: React.MouseEvent) => {
    if (!onSlotOverridesChange) return;
    const slot = effectiveSlots[slotIndex];
    if (!slot) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveDrag({
      slotIndex,
      type: 'resize',
      corner: corner as 'tl' | 'tr' | 'bl' | 'br',
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startRect: { x: slot.x, y: slot.y, width: slot.width, height: slot.height },
      thresholdMet: false,
    });
  }, [effectiveSlots, onSlotOverridesChange]);

  // Card divider drag start
  const handleDividerDragStart = useCallback((
    leftCardId: string,
    rightCardId: string,
    e: React.MouseEvent,
    mergeIds?: { leftCardIds: string[]; rightCardIds: string[] },
  ) => {
    if (!onCardLayoutChange || !cardLayout) return;
    e.preventDefault();
    e.stopPropagation();

    const leftCard = cardLayout.find(c => c.id === leftCardId);
    const rightCard = cardLayout.find(c => c.id === rightCardId);
    if (!leftCard || !rightCard) return;

    // Use rendered widths (from cardRects) as drag baseline so resize is accurate
    const leftRect = cardRects.find(r => r.cardId === leftCardId);
    const rightRect = cardRects.find(r => r.cardId === rightCardId);

    setDividerDrag({
      leftCardId,
      rightCardId,
      startX: e.clientX,
      leftStartWidth: leftRect?.width ?? leftCard.widthPx,
      rightStartWidth: rightRect?.width ?? rightCard.widthPx,
      originalLayout: cardLayout,
      mergeIds,
    });
  }, [cardLayout, onCardLayoutChange]);

  const handleElementScaleDragStart = useCallback(
    (itemId: string, type: 'image' | 'title' | 'price', corner: 'tl' | 'tr' | 'bl' | 'br', startScale: number, e: React.MouseEvent) => {
      if (!onCardLayoutChange) return;
      e.preventDefault();
      e.stopPropagation();
      setElementScaleDrag({ itemId, type, corner, startX: e.clientX, startY: e.clientY, startScale });
    },
    [onCardLayoutChange]
  );

  const handleElementRotateDragStart = useCallback(
    (itemId: string, startRotation: number, centerX: number, centerY: number, e: React.MouseEvent) => {
      if (!onCardLayoutChange) return;
      e.preventDefault();
      e.stopPropagation();
      const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      setElementRotateDrag({ itemId, centerX, centerY, startAngle, startRotation });
    },
    [onCardLayoutChange]
  );

  const handleSubImageScaleDragStart = useCallback(
    (itemId: string, subIdx: number, corner: 'tl' | 'tr' | 'bl' | 'br', startScale: number, e: React.MouseEvent) => {
      if (!onSubImageUpdate) return;
      e.preventDefault();
      e.stopPropagation();
      setSubImageScaleDrag({ itemId, subIdx, corner, startX: e.clientX, startY: e.clientY, startScale });
    },
    [onSubImageUpdate]
  );

  const handleSubImageRotateDragStart = useCallback(
    (itemId: string, subIdx: number, startRot: number, cx: number, cy: number, e: React.MouseEvent) => {
      if (!onSubImageUpdate) return;
      e.preventDefault();
      e.stopPropagation();
      const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      setSubImageRotateDrag({ itemId, subIdx, centerX: cx, centerY: cy, startAngle, startRotation: startRot });
    },
    [onSubImageUpdate]
  );

  const handleImagePanStart = useCallback(
    (itemId: string, startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => {
      if (!onCardLayoutChange) return;
      e.preventDefault();
      e.stopPropagation();
      setImagePanDrag({ itemId, startX: e.clientX, startY: e.clientY, startOffsetX, startOffsetY });
    },
    [onCardLayoutChange]
  );

  const handlePricePanStart = useCallback(
    (itemId: string, startOffsetY: number, e: React.MouseEvent) => {
      if (!onCardLayoutChange) return;
      e.preventDefault();
      e.stopPropagation();
      setPricePanDrag({ itemId, startY: e.clientY, startOffsetY });
    },
    [onCardLayoutChange]
  );

  const handleElementSelect = useCallback(
    (_itemId: string, element: 'title' | 'price' | 'banner' | null) => {
      setActiveToolbarSection(element);
    },
    []
  );

  useEffect(() => {
    if (!editMode || !isCard || !selectedItemId || !cardLayout || !onCardLayoutChange) return;
    if (activeToolbarSection !== 'title' && activeToolbarSection !== 'price') return;

    const handler = (e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;

      const card = cardLayout.find(c => c.itemId === selectedItemId);
      if (!card) return;

      e.preventDefault();
      const step = e.shiftKey ? TEXT_NUDGE_STEP_FAST : TEXT_NUDGE_STEP;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowUp') dy = step;
      if (e.key === 'ArrowDown') dy = -step;

      const patch = computeTextNudgePatch(card, activeToolbarSection, dx, dy);
      if (!patch) return;

      onCardLayoutChange(cardLayout.map(c =>
        c.itemId === selectedItemId ? { ...c, ...patch } : c
      ));
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editMode, isCard, selectedItemId, cardLayout, onCardLayoutChange, activeToolbarSection]);

  const handleBannerPanStart = useCallback(
    (itemId: string, startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => {
      if (!onCardLayoutChange) return;
      e.preventDefault();
      e.stopPropagation();
      setBannerPanDrag({ itemId, startX: e.clientX, startY: e.clientY, startOffsetX, startOffsetY });
    },
    [onCardLayoutChange]
  );

  const handleSubImagePanStart = useCallback(
    (itemId: string, subIdx: number, startOffsetX: number, startOffsetY: number, e: React.MouseEvent) => {
      if (!onSubImageUpdate) return;
      e.preventDefault();
      e.stopPropagation();
      setSubImagePanDrag({ itemId, subIdx, startX: e.clientX, startY: e.clientY, startOffsetX, startOffsetY });
    },
    [onSubImageUpdate]
  );

  const handleOrientationChange = useCallback(
    (itemId: string, orientation: 'vertical' | 'horizontal' | 'top') => {
      if (!onCardLayoutChange || !cardLayout) return;
      const updated = cardLayout.map(c =>
        c.itemId === itemId ? { ...c, orientation } : c
      );
      onCardLayoutChange(updated);
    },
    [cardLayout, onCardLayoutChange]
  );

  // Selected-card text style update helpers
  const handleSelectedTitleFontChange = useCallback((family: string) => {
    handleUpdateSelectedCard({ titleFontFamily: family || undefined });
  }, [handleUpdateSelectedCard]);

  const handleSelectedTitleColorChange = useCallback((color: string) => {
    handleUpdateSelectedCard({ titleColor: color });
  }, [handleUpdateSelectedCard]);

  const handleSelectedTitleItalicToggle = useCallback(() => {
    handleUpdateSelectedCard({ titleItalic: !selectedCard?.titleItalic });
  }, [handleUpdateSelectedCard, selectedCard?.titleItalic]);

  const handleSelectedPriceFontChange = useCallback((family: string) => {
    handleUpdateSelectedCard({ priceFontFamily: family || undefined });
  }, [handleUpdateSelectedCard]);

  const handleSelectedPriceColorChange = useCallback((color: string) => {
    handleUpdateSelectedCard({ priceColor: color });
  }, [handleUpdateSelectedCard]);

  const handleSelectedShowDollarToggle = useCallback(() => {
    handleUpdateSelectedCard({ priceShowDollar: !selectedCard?.priceShowDollar });
  }, [handleUpdateSelectedCard, selectedCard?.priceShowDollar]);

  const handleSelectedTitleBgChange = useCallback((color: string | undefined) => {
    handleUpdateSelectedCard({ titleBg: color });
  }, [handleUpdateSelectedCard]);

  const handleSelectedTitleBgPadChange = useCallback((pad: number) => {
    handleUpdateSelectedCard({ titleBgPad: pad });
  }, [handleUpdateSelectedCard]);

  const handleSelectedTitleEffectChange = useCallback((effect: string | undefined) => {
    handleUpdateSelectedCard({ titleEffect: effect as CardDef["titleEffect"] });
  }, [handleUpdateSelectedCard]);

  const handleSelectedTitleScaleChange = useCallback((scale: number) => {
    handleUpdateSelectedCard({ titleScale: scale });
  }, [handleUpdateSelectedCard]);

  const handleSelectedPriceBgChange = useCallback((color: string | undefined) => {
    handleUpdateSelectedCard({ priceBg: color });
  }, [handleUpdateSelectedCard]);

  const handleSelectedPriceBgPadChange = useCallback((pad: number) => {
    handleUpdateSelectedCard({ priceBgPad: pad });
  }, [handleUpdateSelectedCard]);

  const handleSelectedPriceEffectChange = useCallback((effect: string | undefined) => {
    handleUpdateSelectedCard({ priceEffect: effect as CardDef["priceEffect"] });
  }, [handleUpdateSelectedCard]);

  const handleSelectedPriceScaleChange = useCallback((scale: number) => {
    handleUpdateSelectedCard({ priceScale: scale });
  }, [handleUpdateSelectedCard]);

  const handleSelectedPriceCompChange = useCallback((patch: Partial<PriceCompValues>) => {
    const fieldMap: Record<string, string> = {
      dollarRatio: 'priceCompDollarRatio', dollarOffsetY: 'priceCompDollarOffsetY',
      qtyRatio: 'priceCompQtyRatio',
      decRatio: 'priceCompDecRatio', decOffsetY: 'priceCompDecOffsetY',
      unitRatio: 'priceCompUnitRatio', unitOffsetY: 'priceCompUnitOffsetY',
    };
    const cardPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      const field = fieldMap[k];
      if (field) cardPatch[field] = v;
    }
    handleUpdateSelectedCard(cardPatch);
  }, [handleUpdateSelectedCard]);

  const handleSelectedTitleCompChange = useCallback((patch: Partial<TitleCompValues>) => {
    const fieldMap: Record<string, string> = {
      metaScale: 'titleCompMetaScale', metaOffsetY: 'titleCompMetaOffsetY',
    };
    const cardPatch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      const field = fieldMap[k];
      if (field) cardPatch[field] = v;
    }
    handleUpdateSelectedCard(cardPatch);
  }, [handleUpdateSelectedCard]);

  const handleApplyTextStyleToDepartment = useCallback(() => {
    if (!selectedItemId || !cardLayout || !onCardLayoutChange || !activeToolbarSection) return;
    if (activeToolbarSection !== 'title' && activeToolbarSection !== 'price') return;
    const source = cardLayout.find(c => c.itemId === selectedItemId);
    if (!source) return;
    const patch = textStylePatchFromCard(source, activeToolbarSection);
    onHistoryCommit?.('Apply style to department');
    onCardLayoutChange(cardLayout.map(c => c.itemId ? applyTextStylePatch(c, patch) : c));
  }, [selectedItemId, cardLayout, onCardLayoutChange, activeToolbarSection, onHistoryCommit]);

  const handleApplyTextStyleGlobally = useCallback(() => {
    if (!selectedItemId || !cardLayout || !onApplyTextStyleGlobally || !activeToolbarSection) return;
    if (activeToolbarSection !== 'title' && activeToolbarSection !== 'price') return;
    const source = cardLayout.find(c => c.itemId === selectedItemId);
    if (!source) return;
    onApplyTextStyleGlobally(activeToolbarSection, textStylePatchFromCard(source, activeToolbarSection));
  }, [selectedItemId, cardLayout, onApplyTextStyleGlobally, activeToolbarSection]);

  const handleCropDragStart = useCallback(
    (itemId: string, side: 'left' | 'right' | 'top' | 'bottom', startValue: number, e: React.MouseEvent, bounds?: { width: number; height: number }) => {
      if (!onCardLayoutChange) return;
      e.preventDefault(); e.stopPropagation();
      const rect = cardRectsRef.current.find(r => r.itemId === itemId);
      const card = cardLayout?.find(c => c.itemId === itemId);
      if (!card) return;
      const w = bounds?.width ?? rect?.width ?? card.widthPx;
      const h = bounds?.height ?? rect?.height ?? 200;
      setCropDrag({
        itemId, side, startX: e.clientX, startY: e.clientY, startValue,
        cardWidth: w,
        cardHeight: h,
      });
    },
    [onCardLayoutChange, cardLayout]
  );

  const handleSubImageCropDragStart = useCallback(
    (itemId: string, subIdx: number, side: 'left' | 'right' | 'top' | 'bottom', startValue: number, e: React.MouseEvent, bounds: { width: number; height: number }) => {
      if (!onSubImageUpdate) return;
      e.preventDefault(); e.stopPropagation();
      setSubImageCropDrag({
        itemId, subIdx, side, startX: e.clientX, startY: e.clientY, startValue,
        imgWidth: bounds.width, imgHeight: bounds.height,
      });
    },
    [onSubImageUpdate]
  );

  // Global mouse handlers for slot drag/resize
  useEffect(() => {
    if (!activeDrag) return;

    const MIN_SIZE = 100;
    const DRAG_THRESHOLD = 5;

    const handleMouseMove = (e: MouseEvent) => {
      const rawDx = e.clientX - activeDrag.startMouseX;
      const rawDy = e.clientY - activeDrag.startMouseY;

      if (!activeDrag.thresholdMet) {
        if (Math.abs(rawDx) < DRAG_THRESHOLD && Math.abs(rawDy) < DRAG_THRESHOLD) return;
        setActiveDrag(prev => prev ? { ...prev, thresholdMet: true } : null);
      }

      const dx = rawDx / PREVIEW_SCALE;
      const dy = rawDy / PREVIEW_SCALE;
      const s = activeDrag.startRect;

      if (activeDrag.type === 'move') {
        setLiveSlotOverride({
          slotIndex: activeDrag.slotIndex,
          rect: { x: s.x + dx, y: s.y + dy, width: s.width, height: s.height },
        });
      } else {
        let newX = s.x, newY = s.y, newW = s.width, newH = s.height;
        const corner = activeDrag.corner!;
        if (corner === 'br') {
          newW = Math.max(MIN_SIZE, s.width + dx);
          newH = Math.max(MIN_SIZE, s.height + dy);
        } else if (corner === 'bl') {
          newW = Math.max(MIN_SIZE, s.width - dx);
          newH = Math.max(MIN_SIZE, s.height + dy);
          newX = s.x + s.width - newW;
        } else if (corner === 'tr') {
          newW = Math.max(MIN_SIZE, s.width + dx);
          newH = Math.max(MIN_SIZE, s.height - dy);
          newY = s.y + s.height - newH;
        } else {
          // tl
          newW = Math.max(MIN_SIZE, s.width - dx);
          newH = Math.max(MIN_SIZE, s.height - dy);
          newX = s.x + s.width - newW;
          newY = s.y + s.height - newH;
        }
        setLiveSlotOverride({
          slotIndex: activeDrag.slotIndex,
          rect: { x: newX, y: newY, width: newW, height: newH },
        });
      }
    };

    const handleMouseUp = () => {
      if (liveSlotOverride && activeDrag.thresholdMet && onSlotOverridesChange) {
        const r = liveSlotOverride.rect;
        const rounded = {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
        onSlotOverridesChange({
          ...slotOverrides,
          [activeDrag.slotIndex]: rounded,
        });
      }
      setActiveDrag(null);
      setLiveSlotOverride(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeDrag, liveSlotOverride, onSlotOverridesChange, slotOverrides]);

  // Global mouse handlers for card divider drag
  useEffect(() => {
    if (!dividerDrag || !onCardLayoutChange || !cardLayout) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - dividerDrag.startX) / PREVIEW_SCALE;
      const newLeftWidth = Math.max(MIN_CARD_WIDTH, Math.round(dividerDrag.leftStartWidth + dx));
      const newRightWidth = Math.max(MIN_CARD_WIDTH, Math.round(dividerDrag.rightStartWidth - dx));

      // Clamp: total must stay constant
      const totalWidth = dividerDrag.leftStartWidth + dividerDrag.rightStartWidth;
      const clampedLeft = Math.min(newLeftWidth, totalWidth - MIN_CARD_WIDTH);
      const clampedRight = totalWidth - clampedLeft;

      const updated = cardLayout.map(c => {
        if (c.id === dividerDrag.leftCardId) return { ...c, widthPx: clampedLeft };
        if (c.id === dividerDrag.rightCardId) return { ...c, widthPx: clampedRight };
        return c;
      });
      onCardLayoutChange(updated);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - dividerDrag.startX);
      if (dx < 4 && dividerDrag.mergeIds) {
        // Tiny movement from the merge button — treat as a click: roll back widths and queue merge
        onCardLayoutChange(dividerDrag.originalLayout);
        setPendingClickMerge(dividerDrag.mergeIds);
      }
      // else: drag committed — real-time width updates via mousemove are already applied
      setDividerDrag(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dividerDrag, cardLayout, onCardLayoutChange]);

  // Fire merge after a divider "click" (mouseup with tiny displacement)
  useEffect(() => {
    if (!pendingClickMerge) return;
    handleGroupMergeClick(pendingClickMerge.leftCardIds, pendingClickMerge.rightCardIds);
    setPendingClickMerge(null);
  }, [pendingClickMerge]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global mouse handlers for per-element scale drag
  useEffect(() => {
    if (!elementScaleDrag || !onCardLayoutChange || !cardLayout) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = cardRectsRef.current.find(r => r.itemId === elementScaleDrag.itemId);
      const refPx = rect ? Math.min(rect.width, rect.height) * PREVIEW_SCALE : 100;
      let dx = (e.clientX - elementScaleDrag.startX) / refPx;
      let dy = (e.clientY - elementScaleDrag.startY) / refPx;
      // Project mouse delta into the image's un-rotated local frame so corners
      // behave correctly regardless of the image's current rotation angle.
      if (elementScaleDrag.type === 'image') {
        const card = cardLayout.find(c => c.itemId === elementScaleDrag.itemId);
        const rotDeg = (card as any)?.imageRotation ?? 0;
        if (rotDeg !== 0) {
          const theta = rotDeg * Math.PI / 180;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          const rdx = dx * cos + dy * sin;
          const rdy = -dx * sin + dy * cos;
          dx = rdx;
          dy = rdy;
        }
      }
      const rawDelta =
        elementScaleDrag.corner === 'br' ? (dx + dy) / 2 :
        elementScaleDrag.corner === 'tl' ? (-dx - dy) / 2 :
        elementScaleDrag.corner === 'tr' ? (dx - dy) / 2 :
        (-dx + dy) / 2; // bl
      const newScale = Math.round(
        Math.min(3.0, Math.max(0.2, elementScaleDrag.startScale + rawDelta)) * 1000
      ) / 1000;
      const field = elementScaleDrag.type === 'image' ? 'imageScale'
        : elementScaleDrag.type === 'title' ? 'titleScale' : 'priceScale';
      const updated = cardLayout.map(c =>
        c.itemId === elementScaleDrag.itemId ? { ...c, [field]: newScale } : c
      );
      onCardLayoutChange(updated);
    };

    const handleMouseUp = () => setElementScaleDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [elementScaleDrag, cardLayout, onCardLayoutChange]);

  // Global mouse handlers for per-element rotate drag
  useEffect(() => {
    if (!elementRotateDrag || !onCardLayoutChange || !cardLayout) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentAngle = Math.atan2(
        e.clientY - elementRotateDrag.centerY,
        e.clientX - elementRotateDrag.centerX
      );
      const angleDelta = currentAngle - elementRotateDrag.startAngle;
      const newRotation = Math.round(
        (elementRotateDrag.startRotation + angleDelta * (180 / Math.PI)) * 10
      ) / 10;
      const updated = cardLayout.map(c =>
        c.itemId === elementRotateDrag.itemId ? { ...c, imageRotation: newRotation } : c
      );
      onCardLayoutChange(updated);
    };

    const handleMouseUp = () => setElementRotateDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [elementRotateDrag, cardLayout, onCardLayoutChange]);

  // Global mouse handlers for per-sub-image scale drag
  useEffect(() => {
    if (!subImageScaleDrag || !onSubImageUpdate) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = cardRectsRef.current.find(r => r.itemId === subImageScaleDrag.itemId);
      const refPx = rect ? Math.min(rect.width, rect.height) * PREVIEW_SCALE : 100;
      const dx = (e.clientX - subImageScaleDrag.startX) / refPx;
      const dy = (e.clientY - subImageScaleDrag.startY) / refPx;
      const rawDelta =
        subImageScaleDrag.corner === 'br' ? (dx + dy) / 2 :
        subImageScaleDrag.corner === 'tl' ? (-dx - dy) / 2 :
        subImageScaleDrag.corner === 'tr' ? (dx - dy) / 2 :
        (-dx + dy) / 2; // bl
      const newScale = Math.round(
        Math.min(3.0, Math.max(0.2, subImageScaleDrag.startScale + rawDelta)) * 1000
      ) / 1000;
      onSubImageUpdate(subImageScaleDrag.itemId, subImageScaleDrag.subIdx, { scale: newScale });
    };

    const handleMouseUp = () => setSubImageScaleDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [subImageScaleDrag, onSubImageUpdate]);

  // Global mouse handlers for per-sub-image rotate drag
  useEffect(() => {
    if (!subImageRotateDrag || !onSubImageUpdate) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentAngle = Math.atan2(
        e.clientY - subImageRotateDrag.centerY,
        e.clientX - subImageRotateDrag.centerX
      );
      const angleDelta = currentAngle - subImageRotateDrag.startAngle;
      const newRotation = Math.round(
        (subImageRotateDrag.startRotation + angleDelta * (180 / Math.PI)) * 10
      ) / 10;
      onSubImageUpdate(subImageRotateDrag.itemId, subImageRotateDrag.subIdx, { rotation: newRotation });
    };

    const handleMouseUp = () => setSubImageRotateDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [subImageRotateDrag, onSubImageUpdate]);

  // Global mouse handlers for image pan drag
  useEffect(() => {
    if (!imagePanDrag || !onCardLayoutChange || !cardLayout) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - imagePanDrag.startX) / PREVIEW_SCALE;
      const dy = (e.clientY - imagePanDrag.startY) / PREVIEW_SCALE;
      const newX = Math.round(imagePanDrag.startOffsetX + dx);
      const newY = Math.round(imagePanDrag.startOffsetY + dy);
      const updated = cardLayout.map(c =>
        c.itemId === imagePanDrag.itemId ? { ...c, imageOffsetX: newX, imageOffsetY: newY } : c
      );
      onCardLayoutChange(updated);
    };

    const handleMouseUp = () => setImagePanDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [imagePanDrag, cardLayout, onCardLayoutChange]);

  // Global mouse handlers for price vertical pan drag
  useEffect(() => {
    if (!pricePanDrag || !onCardLayoutChange || !cardLayout) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dy = (e.clientY - pricePanDrag.startY) / PREVIEW_SCALE;
      // Dragging up (negative dy) increases bottom offset → price moves up
      const newOffsetY = Math.round(pricePanDrag.startOffsetY - dy);
      const updated = cardLayout.map(c =>
        c.itemId === pricePanDrag.itemId ? { ...c, priceOffsetY: newOffsetY } : c
      );
      onCardLayoutChange(updated);
    };

    const handleMouseUp = () => setPricePanDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [pricePanDrag, cardLayout, onCardLayoutChange]);

  // Global mouse handlers for banner pan drag
  useEffect(() => {
    if (!bannerPanDrag || !onCardLayoutChange || !cardLayout) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - bannerPanDrag.startX) / PREVIEW_SCALE;
      const dy = (e.clientY - bannerPanDrag.startY) / PREVIEW_SCALE;
      const newX = Math.round(bannerPanDrag.startOffsetX + dx);
      const newY = Math.round(bannerPanDrag.startOffsetY + dy);
      const updated = cardLayout.map(c =>
        c.itemId === bannerPanDrag.itemId ? { ...c, bannerOffsetX: newX, bannerOffsetY: newY } : c
      );
      onCardLayoutChange(updated);
    };

    const handleMouseUp = () => setBannerPanDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [bannerPanDrag, cardLayout, onCardLayoutChange]);

  // Global mouse handlers for sub-image pan drag
  useEffect(() => {
    if (!subImagePanDrag || !onSubImageUpdate) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - subImagePanDrag.startX) / PREVIEW_SCALE;
      const dy = (e.clientY - subImagePanDrag.startY) / PREVIEW_SCALE;
      onSubImageUpdate(subImagePanDrag.itemId, subImagePanDrag.subIdx, {
        x: Math.round(subImagePanDrag.startOffsetX + dx),
        y: Math.round(subImagePanDrag.startOffsetY + dy),
      });
    };

    const handleMouseUp = () => setSubImagePanDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [subImagePanDrag, onSubImageUpdate]);

  // Global mouse handlers for crop drag
  useEffect(() => {
    if (!cropDrag || !onCardLayoutChange || !cardLayout) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - cropDrag.startX) / PREVIEW_SCALE;
      const dy = (e.clientY - cropDrag.startY) / PREVIEW_SCALE;
      const { side, startValue, cardWidth, cardHeight } = cropDrag;
      const card = cardLayout.find(c => c.itemId === cropDrag.itemId);
      const cropL = (card?.cropLeft ?? 0) as number;
      const cropR = (card?.cropRight ?? 0) as number;
      const cropT = (card?.cropTop ?? 0) as number;
      const cropB = (card?.cropBottom ?? 0) as number;

      let newValue: number;
      if (side === 'left')        newValue = Math.max(0, Math.min(startValue + dx,  cardWidth - cropR));
      else if (side === 'right')  newValue = Math.max(0, Math.min(startValue - dx,  cardWidth - cropL));
      else if (side === 'top')    newValue = Math.max(0, Math.min(startValue + dy,  cardHeight - cropB));
      else                        newValue = Math.max(0, Math.min(startValue - dy,  cardHeight - cropT));

      const field = side === 'left' ? 'cropLeft' : side === 'right' ? 'cropRight'
                  : side === 'top'  ? 'cropTop'  : 'cropBottom';
      const updated = cardLayout.map(c =>
        c.itemId === cropDrag.itemId ? { ...c, [field]: Math.round(newValue) } : c
      );
      onCardLayoutChange(updated);
    };

    const handleMouseUp = () => setCropDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [cropDrag, cardLayout, onCardLayoutChange]);

  // Global sub-image crop drag handlers
  useEffect(() => {
    if (!subImageCropDrag || !onSubImageUpdate) return;

    const handleMouseMove = (e: MouseEvent) => {
      const item = itemsRef.current.find((i: any) => i.id === subImageCropDrag.itemId);
      const subOverride = item?.result?.subImageOverrides?.[subImageCropDrag.subIdx] ?? {};
      const dx = (e.clientX - subImageCropDrag.startX) / PREVIEW_SCALE;
      const dy = (e.clientY - subImageCropDrag.startY) / PREVIEW_SCALE;
      const { side, startValue, imgWidth, imgHeight } = subImageCropDrag;
      const cropL = (subOverride.cropLeft ?? 0) as number;
      const cropR = (subOverride.cropRight ?? 0) as number;
      const cropT = (subOverride.cropTop ?? 0) as number;
      const cropB = (subOverride.cropBottom ?? 0) as number;

      let newValue: number;
      if (side === 'left')        newValue = Math.max(0, Math.min(startValue + dx,  imgWidth - cropR));
      else if (side === 'right')  newValue = Math.max(0, Math.min(startValue - dx,  imgWidth - cropL));
      else if (side === 'top')    newValue = Math.max(0, Math.min(startValue + dy,  imgHeight - cropB));
      else                        newValue = Math.max(0, Math.min(startValue - dy,  imgHeight - cropT));

      const field = side === 'left' ? 'cropLeft' : side === 'right' ? 'cropRight'
                  : side === 'top'  ? 'cropTop'  : 'cropBottom';
      onSubImageUpdate(subImageCropDrag.itemId, subImageCropDrag.subIdx, { [field]: Math.round(newValue) });
    };

    const handleMouseUp = () => setSubImageCropDrag(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [subImageCropDrag, onSubImageUpdate]);

  // Global swap drag mouse handlers (registered once — uses refs to avoid stale closures)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Activate swap drag immediately once pointer moves 8px while held
      if (holdPendingRef.current) {
        const dx = e.clientX - holdPendingRef.current.startX;
        const dy = e.clientY - holdPendingRef.current.startY;
        if (Math.hypot(dx, dy) > 8) {
          const { cardId } = holdPendingRef.current;
          holdPendingRef.current = null;
          if (!scaledCanvasRef.current) return;
          const canvasRect2 = scaledCanvasRef.current.getBoundingClientRect();
          const cx = (e.clientX - canvasRect2.left) / PREVIEW_SCALE;
          const cy = (e.clientY - canvasRect2.top) / PREVIEW_SCALE;
          let targetCardId: string | null = null;
          let closestDist = Infinity;
          for (const r of cardRectsRef.current) {
            if (r.cardId === cardId) continue;
            const d = Math.hypot(cx - (r.x + r.width / 2), cy - (r.y + r.height / 2));
            if (d < closestDist) { closestDist = d; targetCardId = r.cardId; }
          }
          setSwapDrag({ cardId, x: e.clientX, y: e.clientY, targetCardId });
          return;
        }
      }

      if (!swapDragRef.current || !scaledCanvasRef.current) return;

      // Find closest card center in canvas coordinates
      const canvasRect = scaledCanvasRef.current.getBoundingClientRect();
      const canvasX = (e.clientX - canvasRect.left) / PREVIEW_SCALE;
      const canvasY = (e.clientY - canvasRect.top) / PREVIEW_SCALE;
      let targetCardId: string | null = null;
      let closestDist = Infinity;
      for (const r of cardRectsRef.current) {
        if (r.cardId === swapDragRef.current.cardId) continue;
        const d = Math.hypot(canvasX - (r.x + r.width / 2), canvasY - (r.y + r.height / 2));
        if (d < closestDist) { closestDist = d; targetCardId = r.cardId; }
      }

      setSwapDrag({ ...swapDragRef.current, x: e.clientX, y: e.clientY, targetCardId });
    };

    const handleMouseUp = () => {
      if (holdPendingRef.current) {
        holdPendingRef.current = null;
      }

      const drag = swapDragRef.current;
      if (!drag) return;
      setSwapDrag(null);

      if (drag.targetCardId) {
        const layout = cardLayoutRef.current;
        const onChange = onCardLayoutChangeRef.current;
        if (!layout || !onChange) return;
        const cardA = layout.find(c => c.id === drag.cardId);
        const cardB = layout.find(c => c.id === drag.targetCardId!);
        if (cardA && cardB) {
          const itemIdA = cardA.itemId;
          const itemIdB = cardB.itemId;
          onChange(layout.map(c => {
            if (c.id === drag.cardId) return { ...c, itemId: itemIdB };
            if (c.id === drag.targetCardId!) return { ...c, itemId: itemIdA };
            return c;
          }));
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []); // empty deps — uses only refs

  // ── Card selection — capture phase so child stopPropagation doesn't block it ──
  const handleSelectionCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !scaledCanvasRef.current || !onSelectItem) return;
    const canvasRect = scaledCanvasRef.current.getBoundingClientRect();
    const canvasX = (e.clientX - canvasRect.left) / PREVIEW_SCALE;
    const canvasY = (e.clientY - canvasRect.top) / PREVIEW_SCALE;
    const hit = cardRectsRef.current.find(r =>
      canvasX >= r.x && canvasX <= r.x + r.width &&
      canvasY >= r.y && canvasY <= r.y + r.height
    );
    // Don't select cards that are currently being processed (cutout or replacement running)
    if (hit?.itemId) {
      const hitItem = itemsRef.current.find((it: any) => it.id === hit.itemId);
      const isProcessing = hitItem?.status === "processing_cutout" || hitItem?.status === "running" ||
        rerunningCutoutMap.has(hit.itemId) ||
        (replacementJobs ?? []).some((j: any) => j.itemId === hit.itemId && j.status === "processing");
      if (isProcessing) return;
    }
    // Reset text section on every canvas click; text element handlers will re-set it in bubble phase
    setActiveToolbarSection(null);
    onSelectItem(hit?.itemId ?? null);
  }, [onSelectItem, replacementJobs]);

  // ── Deselect when clicking outside the canvas or image toolbar ──
  useEffect(() => {
    if (!selectedItemId || !onSelectItem) return;
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('[data-keep-selection]')) return;
      onSelectItem(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedItemId, onSelectItem]);

  // ── Reset element selection when the selected card changes ──
  const prevSelectedItemIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevSelectedItemIdRef.current !== selectedItemId) {
      prevSelectedItemIdRef.current = selectedItemId;
      setActiveToolbarSection(null);
    }
  }, [selectedItemId]);

  if (!config || !page) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!region) {
    return (
      <div style={{ padding: 24, color: "red" }}>
        No region defined for department: {department}
      </div>
    );
  }

  // ---------- HANDLERS: Add/Replace Images ----------
  const handleAddImage = (slotIndex: number) => {
    setAddProductSessionItemIds(new Set());
    setAddImageModalSlot(slotIndex);
  };

  const handleAddImageToCard = (cardId: string) => {
    setAddProductSessionItemIds(new Set());
    setAddImageModalCardId(cardId);
  };

  const closeAddImageModal = () => {
    setAddImageModalSlot(null);
    setAddImageModalCardId(null);
  };

  const getAddProductOptions = () => ({
    slotIndex: addImageModalSlot != null && addImageModalSlot >= 0 ? addImageModalSlot : undefined,
    cardId: addImageModalCardId ?? undefined,
  });

  const trackAddProductItemId = (itemId: string) => {
    setAddProductSessionItemIds(prev => new Set([...prev, itemId]));
  };

  const addProductModalJobs = (replacementJobs ?? []).filter(j =>
    addProductSessionItemIds.has(j.itemId)
  );

  const handleModalLocalFile = async (slotIndex: number, filePath: string) => {
    if (!onEnqueue) return;
    try {
      await onEnqueue([filePath], { slotIndex });
    } catch (err) {
      console.error("Failed to enqueue image:", err);
    }
  };

  const handleModalLocalFileForCard = async (cardId: string, filePath: string) => {
    if (!onEnqueue || !onCardLayoutChange || !cardLayout) return;
    try {
      await onEnqueue([filePath]);
    } catch (err) {
      console.error("Failed to enqueue image for card:", err);
    }
  };

  const handleEnqueueAddProductUrl = (url: string, formMeta: AddProductFormMeta) => {
    if (!onEnqueueAddProduct) return;
    const itemId = onEnqueueAddProduct(url, { ...getAddProductOptions(), formMeta });
    trackAddProductItemId(itemId);
  };

  const handleEnqueueAddProductSeries = (urls: string[], formMeta: AddProductFormMeta) => {
    if (!onEnqueueAddProductSeries) return;
    const itemId = onEnqueueAddProductSeries(urls, { ...getAddProductOptions(), formMeta });
    trackAddProductItemId(itemId);
  };

  const handleReplaceImage = async (itemId: string) => {
    // Use the new in-place replacement if provided
    if (onReplaceImage) {
      await onReplaceImage(itemId);
      return;
    }

    // Fallback to old behavior (remove + enqueue) if no replacement handler provided
    if (!onEnqueue || !onRemove) return;

    try {
      const filePath = await window.ufm.openImageDialog();
      if (!filePath) return; // User canceled

      // Find the slot index of the item being replaced
      const itemToReplace = items.find((item: any) => item.id === itemId);
      const slotIndex = itemToReplace?.slotIndex;

      // Remove old item and add new one with same slot assignment
      onRemove(itemId);
      await onEnqueue([filePath], slotIndex !== undefined ? { slotIndex } : undefined);
    } catch (err) {
      console.error("Failed to replace image:", err);
    }
  };

  // ── Swap drag — hold-to-lift detection ──
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !scaledCanvasRef.current) return;

    const canvasRect = scaledCanvasRef.current.getBoundingClientRect();
    const canvasX = (e.clientX - canvasRect.left) / PREVIEW_SCALE;
    const canvasY = (e.clientY - canvasRect.top) / PREVIEW_SCALE;

    // Hit-test: find which card was pressed
    const hit = cardRects.find(r =>
      canvasX >= r.x && canvasX <= r.x + r.width &&
      canvasY >= r.y && canvasY <= r.y + r.height
    );

    // Swap-drag only applies when layout changes are allowed and not in conflict with other interactions
    if (!onCardLayoutChange || dividerDrag || activeDrag || elementScaleDrag || elementRotateDrag || editMode) return;

    if (!hit) return;

    holdPendingRef.current = null;

    const { clientX: startX, clientY: startY } = e;
    const cardId = hit.cardId;

    holdPendingRef.current = { cardId, startX, startY };
  };

  // Build group dividers — one per minimal matching boundary segment.
  //
  // Strategy: enumerate from each individual card on both sides so that equal-height
  // pairs each get their OWN divider (instead of grouping an entire column together).
  // Deduplication via a Set prevents double-emitting symmetric matches.
  const groupDividers: GroupDivider[] = [];

  if (isCard && cardRects.length > 0 && cardLayout) {
    const gap = innerCardCellGap;

    const getRectForCard = (cardId: string) => cardRects.find(r => r.cardId === cardId);
    const emitted = new Set<string>();

    const tryEmit = (leftIds: string[], rightIds: string[]) => {
      const key = [...leftIds].sort().join(',') + '|' + [...rightIds].sort().join(',');
      if (emitted.has(key)) return;
      emitted.add(key);

      const leftCards = leftIds.map(id => cardLayout.find(c => c.id === id)).filter(Boolean) as CardDef[];
      const anyLeftRect = getRectForCard(leftCards[0].id);
      if (!anyLeftRect) return;

      // Derive y/height from actual rendered rects — matches innerCardRegion geometry
      const leftRects = leftCards.map(c => getRectForCard(c.id)).filter(Boolean) as typeof cardRects;
      const y = Math.min(...leftRects.map(r => r.y));
      const height = Math.max(...leftRects.map(r => r.y + r.height)) - y;
      const x = Math.round(anyLeftRect.x + anyLeftRect.width) + gap / 2;

      groupDividers.push({ leftCardIds: leftIds, rightCardIds: rightIds, x, y, height });
    };

    // Pass 1: for each left card, find right cards fully within its row range
    for (const leftCard of cardLayout) {
      const leftRect = getRectForCard(leftCard.id);
      if (!leftRect) continue;

      const leftRightEdge = Math.round(leftRect.x + leftRect.width);
      const leftMinRow = leftCard.row;
      const leftMaxRow = leftCard.row + (leftCard.rowSpan ?? 1) - 1;

      const rightCardIds: string[] = [];
      for (const rect of cardRects) {
        if (Math.abs(Math.round(rect.x) - (leftRightEdge + gap)) > 2) continue;
        const card = cardLayout.find(c => c.id === rect.cardId);
        if (!card) continue;
        const cardMaxRow = card.row + (card.rowSpan ?? 1) - 1;
        if (card.row < leftMinRow || cardMaxRow > leftMaxRow) continue;
        rightCardIds.push(rect.cardId);
      }

      if (rightCardIds.length === 0) continue;
      const rightSpanTotal = rightCardIds
        .map(id => cardLayout.find(c => c.id === id)!)
        .filter(Boolean)
        .reduce((sum, c) => sum + (c.rowSpan ?? 1), 0);
      if (rightSpanTotal !== (leftCard.rowSpan ?? 1)) continue;

      tryEmit([leftCard.id], rightCardIds);
    }

    // Pass 2: for each right card, find left cards fully within its row range
    // (handles tall-right / multi-left cases not caught by Pass 1)
    for (const rightCard of cardLayout) {
      const rightRect = getRectForCard(rightCard.id);
      if (!rightRect) continue;

      const rightLeftEdge = Math.round(rightRect.x);
      const rightMinRow = rightCard.row;
      const rightMaxRow = rightCard.row + (rightCard.rowSpan ?? 1) - 1;

      const leftCardIds: string[] = [];
      for (const rect of cardRects) {
        if (Math.abs(Math.round(rect.x + rect.width) - (rightLeftEdge - gap)) > 2) continue;
        const card = cardLayout.find(c => c.id === rect.cardId);
        if (!card) continue;
        const cardMaxRow = card.row + (card.rowSpan ?? 1) - 1;
        if (card.row < rightMinRow || cardMaxRow > rightMaxRow) continue;
        leftCardIds.push(rect.cardId);
      }

      if (leftCardIds.length === 0) continue;
      const leftSpanTotal = leftCardIds
        .map(id => cardLayout.find(c => c.id === id)!)
        .filter(Boolean)
        .reduce((sum, c) => sum + (c.rowSpan ?? 1), 0);
      if (leftSpanTotal !== (rightCard.rowSpan ?? 1)) continue;

      tryEmit(leftCardIds, [rightCard.id]);
    }
  }

  // Build group vertical dividers — minimal matching boundary segments (same 2-pass approach as horizontal)
  // ── Shared helpers ──
  const getTitle = (item: any) => {
    const title = item?.result?.title;
    return title?.en || title?.zh || "";
  };
  const getCutout = (item: any) => item?.result?.cutoutPath;

  // ── Vertical merge handler (2-card) ──
  const handleMergeClick = (cardAId: string, cardBId: string, direction: "horizontal" | "vertical") => {
    if (!cardLayout || !onCardLayoutChange) return;

    const cardA = cardLayout.find(c => c.id === cardAId);
    const cardB = cardLayout.find(c => c.id === cardBId);
    if (!cardA || !cardB) return;

    const itemA = cardA.itemId ? items.find((it: any) => it.id === cardA.itemId) : null;
    const itemB = cardB.itemId ? items.find((it: any) => it.id === cardB.itemId) : null;

    // Both empty or only one has product — merge immediately
    if (!itemA && !itemB) {
      executeMerge(cardAId, cardBId, direction, undefined);
      return;
    }
    if (itemA && !itemB) {
      executeMerge(cardAId, cardBId, direction, cardA.itemId);
      return;
    }
    if (!itemA && itemB) {
      executeMerge(cardAId, cardBId, direction, cardB.itemId);
      return;
    }

    // Both have products — show dialog
    setMergeDialog({
      candidates: [
        { cardId: cardAId, itemId: cardA.itemId!, title: getTitle(itemA), cutoutPath: getCutout(itemA) },
        { cardId: cardBId, itemId: cardB.itemId!, title: getTitle(itemB), cutoutPath: getCutout(itemB) },
      ],
      onConfirm: (keepItemId) => {
        const removeItemId = keepItemId === cardA.itemId ? cardB.itemId! : cardA.itemId!;
        executeMerge(cardAId, cardBId, direction, keepItemId, removeItemId);
      },
    });
  };

  // ── Group merge handler (horizontal boundary, N:M cards) ──
  const handleGroupMergeClick = (leftCardIds: string[], rightCardIds: string[]) => {
    if (!cardLayout || !onCardLayoutChange) return;

    const allIds = [...leftCardIds, ...rightCardIds];
    const allCards = allIds
      .map(id => cardLayout.find(c => c.id === id))
      .filter(Boolean) as CardDef[];
    const withItems = allCards.filter(c => c.itemId);

    if (withItems.length <= 1) {
      executeGroupMerge(leftCardIds, rightCardIds, withItems[0]?.itemId);
      return;
    }

    const candidates: MergeCandidate[] = withItems.map(c => {
      const item = items.find((it: any) => it.id === c.itemId);
      return { cardId: c.id, itemId: c.itemId!, title: getTitle(item), cutoutPath: getCutout(item) };
    });

    setMergeDialog({
      candidates,
      onConfirm: (keepItemId) => executeGroupMerge(leftCardIds, rightCardIds, keepItemId),
    });
  };

  // ── Execute group merge ──
  const executeGroupMerge = (
    leftCardIds: string[],
    rightCardIds: string[],
    keepItemId?: string,
  ) => {
    if (!cardLayout || !onCardLayoutChange) return;

    let updated = cardLayout.map(c => ({ ...c }));

    const leftCards = leftCardIds
      .map(id => updated.find(c => c.id === id))
      .filter(Boolean) as CardDef[];
    const rightCards = rightCardIds
      .map(id => updated.find(c => c.id === id))
      .filter(Boolean) as CardDef[];
    const allCards = [...leftCards, ...rightCards];

    // Anchor = topmost card in left group (preserves left column position)
    const anchor = [...leftCards].sort((a, b) => a.row - b.row || a.order - b.order)[0];

    // New width = left column rendered width + gap + right column rendered width
    const leftRectW = cardRects.find(r => r.cardId === leftCards[0].id)?.width ?? leftCards[0].widthPx;
    const rightRectW = cardRects.find(r => r.cardId === rightCards[0].id)?.width ?? rightCards[0].widthPx;
    anchor.widthPx = leftRectW + innerCardCellGap + rightRectW;

    // rowSpan covers full combined row range
    const minRow = Math.min(...allCards.map(c => c.row));
    const maxRow = Math.max(...allCards.map(c => c.row + (c.rowSpan ?? 1) - 1));
    anchor.rowSpan = maxRow - minRow + 1;
    anchor.row = minRow;
    anchor.itemId = keepItemId;

    // Dropped item IDs (all items in the group except the kept one)
    const droppedItemIds = allCards
      .filter(c => c.id !== anchor.id && c.itemId && c.itemId !== keepItemId)
      .map(c => c.itemId!);

    // Remove all cards in both groups except anchor
    const allIdSet = new Set([...leftCardIds, ...rightCardIds]);
    updated = updated.filter(c => c.id === anchor.id || !allIdSet.has(c.id));

    // Re-number order within all affected rows
    const affectedRows = new Set(allCards.map(c => c.row));
    for (const row of affectedRows) {
      const rowCards = updated.filter(c => c.row === row).sort((a, b) => a.order - b.order);
      rowCards.forEach((c, i) => { c.order = i; });
    }

    onCardLayoutChange(updated);
    setMergeDialog(null);
    droppedItemIds.forEach(id => onRemoveFromQueue?.(id));
  };

  const executeMerge = (
    cardAId: string,
    cardBId: string,
    direction: "horizontal" | "vertical",
    keepItemId?: string,
    removeItemId?: string,
  ) => {
    if (!cardLayout || !onCardLayoutChange) return;

    // Deep-copy cards to avoid mutating originals (which breaks undo history)
    let updated = cardLayout.map(c => ({ ...c }));
    const cardA = updated.find(c => c.id === cardAId)!;
    const cardB = updated.find(c => c.id === cardBId)!;

    // Collect the item that will be dropped (if any)
    const droppedItemId = removeItemId
      ?? [cardA.itemId, cardB.itemId].find(id => id && id !== keepItemId);

    if (direction === "horizontal") {
      // Add right card's rendered width + gap to left card
      const rectA = cardRects.find(r => r.cardId === cardAId);
      const rectB = cardRects.find(r => r.cardId === cardBId);
      cardA.widthPx = (rectA?.width ?? cardA.widthPx) + innerCardCellGap + (rectB?.width ?? cardB.widthPx);
      cardA.itemId = keepItemId;
      // Remove right card
      updated = updated.filter(c => c.id !== cardBId);
      // Re-number order in the affected row
      const rowCards = updated.filter(c => c.row === cardA.row).sort((a, b) => a.order - b.order);
      rowCards.forEach((c, i) => { c.order = i; });
    } else {
      // Vertical merge
      const topCard = cardA.row <= cardB.row ? cardA : cardB;
      const bottomCard = topCard === cardA ? cardB : cardA;
      topCard.rowSpan = (topCard.rowSpan ?? 1) + (bottomCard.rowSpan ?? 1);
      topCard.itemId = keepItemId;
      // Remove bottom card
      updated = updated.filter(c => c.id !== bottomCard.id);
    }

    onCardLayoutChange(updated);
    setMergeDialog(null);

    // Remove the unkept item from queue only (not card layout —
    // the merged layout already excludes it).
    if (droppedItemId && onRemoveFromQueue) {
      onRemoveFromQueue(droppedItemId);
    }
  };

  return (
    <>
    {elementRotateDrag && (
      <style>{`* { cursor: grabbing !important; }`}</style>
    )}
    {/* Merge selection dialog */}
    {mergeDialog && (
      <MergeSelectionDialog
        candidates={mergeDialog.candidates}
        onSelect={(keepItemId) => {
          mergeDialog.onConfirm(keepItemId);
          setMergeDialog(null);
        }}
        onCancel={() => setMergeDialog(null)}
      />
    )}

    {/* Cutout eraser modal */}
    {eraserItemId && (() => {
      const it = items.find((i: any) => i.id === eraserItemId);
      // Use the same source priority as RenderFlyerPlacements so the modal opens
      // the exact file that the editor card is displaying.
      const rawDisplaySrc = it?.image?.src ?? it?.cutoutPath ?? (it?.result?.cutoutPath || null) ?? null;
      const cutoutPath = (rawDisplaySrc && !String(rawDisplaySrc).startsWith("http"))
        ? rawDisplaySrc
        : (it?.result?.cutoutPath ?? it?.cutoutPath ?? null);
      const sourcePath = it?.result?.inputPath ?? it?.path ?? null;
      const sourceUrl = it?.result?.sourceUrl ?? null;
      if (!cutoutPath) return null;
      return (
        <CutoutEraserModal
          key={eraserItemId}
          cutoutPath={cutoutPath}
          sourcePath={sourcePath}
          sourceUrl={sourceUrl}
          onSave={(newPath) => {
            onCutoutErased?.(eraserItemId, newPath);
            setEraserItemId(null);
          }}
          onClose={() => setEraserItemId(null)}
        />
      );
    })()}

    {/* Image properties sidebar toolbar — hidden when a text element is active */}
    {isCard && selectedItemId && onCardLayoutChange && !activeToolbarSection && (
      <ImageToolbar
        card={selectedCard}
        itemId={selectedItemId}
        onUpdateCard={handleUpdateSelectedCard}
        onEditCutout={() => setEraserItemId(selectedItemId)}
        onRerunCutout={handleRerunCutout}
        rerunningCutout={rerunningCutoutMap.has(selectedItemId ?? '')}
        visible={true}
      />
    )}

    {/* AddImageModal for slot-based */}
    {addImageModalSlot !== null && (
      <AddImageModal
        slotIndex={addImageModalSlot}
        onLocalFile={handleModalLocalFile}
        onSelectDbProduct={onEnqueueAddProduct ? handleEnqueueAddProductUrl : undefined}
        onDropImage={onEnqueueAddProduct ? handleEnqueueAddProductUrl : undefined}
        onEnqueueSeries={onEnqueueAddProductSeries ? handleEnqueueAddProductSeries : undefined}
        jobs={addProductModalJobs}
        onCancelJob={onCancelReplacementJob}
        onClose={closeAddImageModal}
      />
    )}

    {/* AddImageModal for card-based */}
    {addImageModalCardId !== null && (
      <AddImageModal
        slotIndex={-1}
        onLocalFile={(_slot, filePath) => handleModalLocalFileForCard(addImageModalCardId!, filePath)}
        onSelectDbProduct={onEnqueueAddProduct ? handleEnqueueAddProductUrl : undefined}
        onDropImage={onEnqueueAddProduct ? handleEnqueueAddProductUrl : undefined}
        onEnqueueSeries={onEnqueueAddProductSeries ? handleEnqueueAddProductSeries : undefined}
        jobs={addProductModalJobs}
        onCancelJob={onCancelReplacementJob}
        onClose={closeAddImageModal}
      />
    )}


    {/* ── Swap drag ghost (fixed, follows cursor, outside canvas transform) ── */}
    {swapDrag && isCard && (() => {
      const dragCard = cardLayout?.find(c => c.id === swapDrag.cardId);
      const item = dragCard?.itemId ? items.find((it: any) => it.id === dragCard.itemId) : null;
      return (
        <div style={{
          position: 'fixed',
          left: swapDrag.x - 55,
          top: swapDrag.y - 65,
          width: 110,
          height: 110,
          background: '#fff',
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          opacity: 0.9,
          pointerEvents: 'none',
          zIndex: 99999,
          transform: 'rotate(-2deg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {item?.result?.cutoutPath
            ? <img src={`file://${item.result.cutoutPath}`} style={{ width: 100, height: 100, objectFit: 'contain' }} />
            : <div style={{ width: 80, height: 80, background: '#e5e7eb', borderRadius: 6 }} />
          }
        </div>
      );
    })()}

    {/* Text side toolbar — shown in place of image toolbar when title/price is active */}
    {isCard && editMode && selectedItemId && cardLayout && onCardLayoutChange &&
      (activeToolbarSection === 'title' || activeToolbarSection === 'price') && (() => {
      const firstCard = cardLayout.find(c => c.itemId);
      const activeCard = selectedCard ?? firstCard;
      return (
        <TextSideToolbar
          activeSection={activeToolbarSection as 'title' | 'price'}
          itemId={selectedItemId}
          titleFont={activeCard?.titleFontFamily}
          titleColor={activeCard?.titleColor ?? "#000000"}
          titleItalic={!!activeCard?.titleItalic}
          titleBg={activeCard?.titleBg}
          titleBgPad={activeCard?.titleBgPad ?? 2}
          titleEffect={activeCard?.titleEffect}
          titleScale={activeCard?.titleScale ?? 1}
          priceFont={activeCard?.priceFontFamily}
          priceColor={activeCard?.priceColor ?? "#000000"}
          priceShowDollar={!!activeCard?.priceShowDollar}
          priceBg={activeCard?.priceBg}
          priceBgPad={activeCard?.priceBgPad ?? 2}
          priceEffect={activeCard?.priceEffect}
          priceScale={activeCard?.priceScale ?? 1}
          onTitleFontChange={handleSelectedTitleFontChange}
          onTitleColorChange={handleSelectedTitleColorChange}
          onTitleItalicToggle={handleSelectedTitleItalicToggle}
          onTitleBgChange={handleSelectedTitleBgChange}
          onTitleBgPadChange={handleSelectedTitleBgPadChange}
          onTitleEffectChange={handleSelectedTitleEffectChange}
          onTitleScaleChange={handleSelectedTitleScaleChange}
          onPriceFontChange={handleSelectedPriceFontChange}
          onPriceColorChange={handleSelectedPriceColorChange}
          onShowDollarToggle={handleSelectedShowDollarToggle}
          onPriceBgChange={handleSelectedPriceBgChange}
          onPriceBgPadChange={handleSelectedPriceBgPadChange}
          onPriceEffectChange={handleSelectedPriceEffectChange}
          onPriceScaleChange={handleSelectedPriceScaleChange}
          onOpenComponentEditor={() => setShowTextCompDialog(true)}
          onApplyToDepartment={handleApplyTextStyleToDepartment}
          onApplyGlobally={onApplyTextStyleGlobally ? handleApplyTextStyleGlobally : undefined}
          departmentLabel={departmentLabel}
          onClose={() => setActiveToolbarSection(null)}
          visible={true}
        />
      );
    })()}

    {/* Text components dialog — fine-tune sub-component sizes/offsets */}
    {showTextCompDialog && isCard && editMode && cardLayout && onCardLayoutChange &&
      (activeToolbarSection === 'title' || activeToolbarSection === 'price') && (() => {
      const firstCard = cardLayout.find(c => c.itemId);
      const activeCard = selectedCard ?? firstCard;
      const selectedLabel = (discountLabels as any)?.find((l: any) => l?.id === selectedItemId);
      const selectedItem = items.find((it: any) => it.id === selectedItemId);
      const priceCompValues: PriceCompValues = {
        dollarRatio:  (activeCard?.priceCompDollarRatio as number | undefined) ?? PRICE_COMP_DEFAULTS.dollarRatio,
        dollarOffsetY:(activeCard?.priceCompDollarOffsetY as number | undefined) ?? PRICE_COMP_DEFAULTS.dollarOffsetY,
        qtyRatio:     (activeCard?.priceCompQtyRatio as number | undefined) ?? PRICE_COMP_DEFAULTS.qtyRatio,
        decRatio:     (activeCard?.priceCompDecRatio as number | undefined) ?? PRICE_COMP_DEFAULTS.decRatio,
        decOffsetY:   (activeCard?.priceCompDecOffsetY as number | undefined) ?? PRICE_COMP_DEFAULTS.decOffsetY,
        unitRatio:    (activeCard?.priceCompUnitRatio as number | undefined) ?? PRICE_COMP_DEFAULTS.unitRatio,
        unitOffsetY:  (activeCard?.priceCompUnitOffsetY as number | undefined) ?? PRICE_COMP_DEFAULTS.unitOffsetY,
      };
      const titleCompValues: TitleCompValues = {
        metaScale:   (activeCard?.titleCompMetaScale as number | undefined) ?? TITLE_COMP_DEFAULTS.metaScale,
        metaOffsetY: (activeCard?.titleCompMetaOffsetY as number | undefined) ?? TITLE_COMP_DEFAULTS.metaOffsetY,
      };
      const samplePrice =
        selectedLabel?.price?.display ||
        getItemPriceDisplay(selectedItem) ||
        (discountLabels as any)?.find((l: any) => l.price?.display)?.price?.display ||
        "$9.99";
      const sampleMeta = (() => {
        const lbl = selectedLabel?.title?.size || selectedLabel?.title?.regularPrice
          ? selectedLabel
          : (discountLabels as any)?.find((l: any) => l.title?.size || l.title?.regularPrice);
        if (!lbl) return undefined;
        return [lbl.title?.size, lbl.title?.regularPrice ? `REG $${lbl.title.regularPrice}` : undefined].filter(Boolean).join('  /  ');
      })();
      return (
        <TextComponentsDialog
          section={activeToolbarSection as 'title' | 'price'}
          priceDisplay={samplePrice}
          priceShowDollar={!!(activeCard?.priceShowDollar)}
          priceFont={activeCard?.priceFontFamily}
          priceColor={activeCard?.priceColor ?? '#000000'}
          priceEffect={activeCard?.priceEffect}
          priceEffectColor={activeCard?.priceBg}
          priceEffectSize={activeCard?.priceBgPad ?? 2}
          priceCompValues={priceCompValues}
          onPriceCompChange={handleSelectedPriceCompChange}
          titleSampleMeta={sampleMeta}
          titleFont={activeCard?.titleFontFamily}
          titleColor={activeCard?.titleColor ?? '#000000'}
          titleItalic={!!activeCard?.titleItalic}
          titleCompValues={titleCompValues}
          onTitleCompChange={handleSelectedTitleCompChange}
          onClose={() => setShowTextCompDialog(false)}
        />
      );
    })()}

    <div
      key={page.pageId} // hard reset per page
      style={{ marginTop: 24, display: "flex", justifyContent: "center", position: "relative" }}
    >
      <div
        ref={scaledCanvasRef}
        style={{
          transform: `scale(${PREVIEW_SCALE})`,
          transformOrigin: "top center",
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "relative",
            width: imageSize?.width ?? 1600,
            height: imageSize?.height ?? 2400,
            background: "#fff",
            overflow: "visible",
            userSelect: "none",
          }}
          data-keep-selection="true"
          onMouseDown={isCard && onCardLayoutChange ? handleCanvasMouseDown : undefined}
          onMouseDownCapture={isCard && onSelectItem ? handleSelectionCapture : undefined}
          onContextMenu={isCard && editMode ? (e) => {
            e.preventDefault();
            if (!scaledCanvasRef.current) return;
            const canvasRect = scaledCanvasRef.current.getBoundingClientRect();
            const canvasX = (e.clientX - canvasRect.left) / PREVIEW_SCALE;
            const canvasY = (e.clientY - canvasRect.top) / PREVIEW_SCALE;
            const hit = cardRects.find(r =>
              r.itemId &&
              canvasX >= r.x && canvasX <= r.x + r.width &&
              canvasY >= r.y && canvasY <= r.y + r.height
            );
            if (!hit?.itemId) return;
            const itemId = hit.itemId;
            const item = items.find((it: any) => it.id === itemId);
            const menuActions: Array<{ id: string; label: string; enabled?: boolean }> = [];
            if ((item?.result?.allFlavorPaths?.length ?? 0) > 1 && onPickSeriesFlavors) {
              const isPending = item?.result?.pendingFlavorSelection === true;
              menuActions.push({ id: 'flavors', label: isPending ? 'Select Flavors' : 'Change Flavors' });
            }
            if (onEditTitle) menuActions.push({ id: 'editTitle', label: 'Edit Discount Details' });
            if (onGoogleSearch) menuActions.push({ id: 'googleSearch', label: 'Google Search' });
            menuActions.push({ id: 'dbResults', label: 'Database Results', enabled: !!onChooseDatabaseResults });
            menuActions.push({ id: 'uploadLocal', label: 'Upload from Local' });
            if (item?.result?.sourceUrl) menuActions.push({ id: 'openSource', label: 'Open Source Image' });
            const sourceFilePath = item?.result?.inputPath ?? item?.path ?? null;
            if (sourceFilePath) menuActions.push({ id: 'showInFolder', label: 'Show Source in Folder' });
            (window as any).ufm.showContextMenu(itemId, menuActions);
          } : undefined}
        >
          {/* template image */}
          <img
            src={imagePath}
            onLoad={e =>
              setImageSize({
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />

          {/* White bands covering gaps between department product regions.
              Source flyer images baked into the underprint often have printed
              divider lines between sections; these bands hide them. */}
          {imageSize && page?.departmentAreas && page.departmentAreas.length > 1 && (() => {
            const sorted = [...page.departmentAreas]
              .filter(a => a.productRegion)
              .sort((a, b) => a.productRegion.y - b.productRegion.y);
            return sorted.slice(0, -1).map((area, i) => {
              const above = area.productRegion;
              const below = sorted[i + 1].productRegion;
              const bandTop = above.y + above.height - 3;
              const bandBottom = below.y + 3;
              if (bandBottom <= bandTop) return null;
              return (
                <div
                  key={`dept-gap-${i}`}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: bandTop,
                    width: imageSize.width,
                    height: bandBottom - bandTop,
                    background: page.backgroundColor ?? "#ffffff",
                    pointerEvents: "none",
                  }}
                />
              );
            });
          })()}

          {/* ═══ CARD-BASED DEPARTMENT ═══ */}
          {imageSize && isCard && cardClipStyle && (
            <div style={cardClipStyle}>
              {/* Region background — fills gap areas between cards with the department color.
                  Card backgrounds render on top, so only the inter-card gaps show this. */}
              {cardRegion && departmentArea?.regionStyle?.backgroundColor && (
                <div
                  style={{
                    position: "absolute",
                    left: cardRegion.x,
                    top: cardRegion.y,
                    width: cardRegion.width,
                    height: cardRegion.height,
                    background: departmentArea.regionStyle.backgroundColor,
                    pointerEvents: "none",
                  }}
                />
              )}

              {/* Card backgrounds */}
              {cardRects.map((rect) => {
                const cs = templateCardStyle;
                const borderW = Math.max(0, cs?.borderWidth ?? 0);
                return (
                  <div
                    key={`card-bg-${rect.cardId}`}
                    style={{
                      position: "absolute",
                      left: rect.x,
                      top: rect.y,
                      width: rect.width,
                      height: rect.height,
                      background: cs?.backgroundColor ?? CARD_BG,
                      boxSizing: "border-box",
                      border: borderW > 0
                        ? `${borderW}px solid ${cs?.borderColor ?? "#e2e8f0"}`
                        : undefined,
                      borderRadius: cs?.borderRadius ?? 0,
                      boxShadow: cs?.hasShadow
                        ? "0 2px 8px rgba(15, 23, 42, 0.18)"
                        : undefined,
                    }}
                  />
                );
              })}


              {/* Product content on filled cards */}
              {cardPlacements.length > 0 && (
                <RenderFlyerPlacements
                  items={items}
                  placements={cardPlacements}
                  discountLabels={discountLabels as any}
                  flyerWeekStart={flyerWeekStart}
                  editMode={editMode}
                  activeScaleDrag={elementScaleDrag}
                  onElementDragStart={onCardLayoutChange && editMode ? handleElementScaleDragStart : undefined}
                  onRotateDragStart={onCardLayoutChange && editMode ? handleElementRotateDragStart : undefined}
                  onEditTitle={onEditTitle && editMode ? onEditTitle : undefined}
                  onEditPrice={onEditTitle && editMode ? onEditTitle : undefined}
                  onSubImageScaleDragStart={onSubImageUpdate && editMode ? handleSubImageScaleDragStart : undefined}
                  onSubImageRotateDragStart={onSubImageUpdate && editMode ? handleSubImageRotateDragStart : undefined}
                  onDeleteSubImage={onDeleteSubImage && editMode ? onDeleteSubImage : undefined}
                  onImagePanStart={onCardLayoutChange && editMode ? handleImagePanStart : undefined}
                  onSubImagePanStart={onSubImageUpdate && editMode ? handleSubImagePanStart : undefined}
                  onOrientationChange={onCardLayoutChange && editMode ? handleOrientationChange : undefined}
                  onCropDragStart={onCardLayoutChange && editMode ? handleCropDragStart : undefined}
                  onSubImageCropDragStart={onSubImageUpdate && editMode ? handleSubImageCropDragStart : undefined}
                  onBannerPanStart={onCardLayoutChange && editMode ? handleBannerPanStart : undefined}
                  onPricePanStart={onCardLayoutChange && editMode ? handlePricePanStart : undefined}
                  onEditBannerDays={onEditBannerDays && editMode ? onEditBannerDays : undefined}
                  onElementSelect={editMode ? handleElementSelect : undefined}
                  replacementJobs={replacementJobs}
                  onCancelReplacementJob={onCancelReplacementJob}
                  rerunningCutoutMap={rerunningCutoutMap}
                  onPanelImageDrop={onPanelImageDrop}
                />
              )}

              {/* Card overlays (add/replace/edit/delete buttons; edit menu via right-click in editMode) */}
              <div style={{ pointerEvents: swapDrag ? 'none' : 'auto' }}>
                <SlotOverlays
                  slots={cardRects.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }))}
                  items={items}
                  placements={cardPlacements}
                  onAddImage={(idx) => {
                    const rect = cardRects[idx];
                    if (rect) handleAddImageToCard(rect.cardId);
                  }}
                  onReplaceImage={handleReplaceImage}
                  onRemoveItem={onRemoveItem}
                  onChooseDatabaseResults={onChooseDatabaseResults}
                  onGoogleSearch={onGoogleSearch}
                  onEditTitle={onEditTitle}
                  onPickSeriesFlavors={onPickSeriesFlavors}
                  onPanelImageDrop={onPanelImageDrop}
                  cardMode
                  cardRects={cardRects}
                  cardLayout={cardLayout ?? undefined}
                  isLocked={isLocked}
                  editMode={editMode}
                />
              </div>

              {/* Card border outlines */}
              {onCardLayoutChange && cardRects.map((rect) => (
                <div
                  key={`scale-overlay-${rect.cardId}`}
                  style={{
                    position: "absolute",
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: rect.height,
                    border: "1px dashed rgba(255,255,255,0.35)",
                    boxSizing: "border-box",
                    pointerEvents: "none",
                    zIndex: 45,
                  }}
                />
              ))}

              {/* Column merge dividers — rectangular bars filling the gap between horizontally adjacent cells */}
              {!editMode && onCardLayoutChange && groupDividers.map((d, idx) => {
                const is1to1 = d.leftCardIds.length === 1 && d.rightCardIds.length === 1;
                const hovered = hoveredHMerge === idx;
                const dragging = dividerDrag?.leftCardId === d.leftCardIds[0];
                return (
                  <div
                    key={`divider-${idx}`}
                    onMouseEnter={() => setHoveredHMerge(idx)}
                    onMouseLeave={() => setHoveredHMerge(null)}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (is1to1) {
                        handleDividerDragStart(
                          d.leftCardIds[0], d.rightCardIds[0], e,
                          { leftCardIds: d.leftCardIds, rightCardIds: d.rightCardIds },
                        );
                      } else {
                        handleGroupMergeClick(d.leftCardIds, d.rightCardIds);
                      }
                    }}
                    title={is1to1 ? "Click to merge · Drag to resize" : "Merge cells"}
                    style={{
                      position: "absolute",
                      left: d.x - DEFAULT_CELL_GAP / 2,
                      top: d.y,
                      width: DEFAULT_CELL_GAP,
                      height: d.height,
                      zIndex: 150,
                      background: dragging
                        ? "rgba(59,91,219,0.85)"
                        : hovered
                          ? "rgba(79,110,245,0.55)"
                          : "rgba(148,163,184,0.18)",
                      borderRadius: 4,
                      cursor: is1to1 ? "col-resize" : "pointer",
                      pointerEvents: "auto",
                      transition: "background 0.12s",
                    }}
                  />
                );
              })}

              {/* Swap drag highlights */}
              {swapDrag && (() => {
                const sourceR = cardRects.find(r => r.cardId === swapDrag.cardId);
                const targetR = swapDrag.targetCardId
                  ? cardRects.find(r => r.cardId === swapDrag.targetCardId)
                  : undefined;
                return (
                  <>
                    {sourceR && (
                      <div key="swap-source" style={{
                        position: 'absolute', left: sourceR.x, top: sourceR.y,
                        width: sourceR.width, height: sourceR.height,
                        border: '3px dashed #4C6EF5', borderRadius: 4,
                        background: 'rgba(76,110,245,0.10)',
                        pointerEvents: 'none', zIndex: 72, boxSizing: 'border-box',
                      }} />
                    )}
                    {targetR && (
                      <div key="swap-target" style={{
                        position: 'absolute', left: targetR.x, top: targetR.y,
                        width: targetR.width, height: targetR.height,
                        border: '4px solid #22C55E', borderRadius: 4,
                        background: 'rgba(34,197,94,0.10)',
                        pointerEvents: 'none', zIndex: 73, boxSizing: 'border-box',
                      }} />
                    )}
                  </>
                );
              })()}

            </div>
          )}

          {/* ═══ SLOT-BASED DEPARTMENT ═══ */}
          {imageSize && isSlotted && effectiveSlots.map((slot: SlotRect, i: number) => {
            const isDragging = activeDrag?.slotIndex === i && activeDrag.thresholdMet;
            const EDGE = 12; // clickable border strip thickness in px
            return (
              <div
                key={`slot-${i}`}
                style={{
                  position: "absolute",
                  left: slot.x,
                  top: slot.y,
                  width: slot.width,
                  height: slot.height,
                  border: isDragging ? "2px solid #4C6EF5" : "2px dashed rgba(255,0,0,0.4)",
                  background: isDragging ? "rgba(76,110,245,0.08)" : "transparent",
                  zIndex: 10000,
                  pointerEvents: "none",
                  boxShadow: isDragging ? "0 8px 32px rgba(0,0,0,0.2)" : undefined,
                  boxSizing: "border-box",
                }}
              >
                {/* Border edge strips — clickable for move drag */}
                {onSlotOverridesChange && ([
                  { key: 'et', style: { top: 0, left: EDGE, right: EDGE, height: EDGE } },
                  { key: 'eb', style: { bottom: 0, left: EDGE, right: EDGE, height: EDGE } },
                  { key: 'el', style: { left: 0, top: EDGE, bottom: EDGE, width: EDGE } },
                  { key: 'er', style: { right: 0, top: EDGE, bottom: EDGE, width: EDGE } },
                ] as const).map(({ key, style }) => (
                  <div
                    key={key}
                    onMouseDown={e => handleSlotDragStart(i, e)}
                    style={{
                      position: 'absolute',
                      pointerEvents: 'auto',
                      cursor: isDragging ? 'grabbing' : 'grab',
                      ...style,
                    }}
                  />
                ))}

                {/* Resize handles on corners */}
                {onSlotOverridesChange && (['tl','tr','bl','br'] as const).map(corner => (
                  <div
                    key={corner}
                    onMouseDown={e => { e.stopPropagation(); handleSlotResizeStart(i, corner, e); }}
                    style={{
                      position: 'absolute',
                      width: 14,
                      height: 14,
                      background: '#4C6EF5',
                      border: '2px solid white',
                      borderRadius: 3,
                      pointerEvents: 'auto',
                      cursor: corner === 'tl' || corner === 'br' ? 'nwse-resize' : 'nesw-resize',
                      ...(corner.includes('t') ? { top: -7 } : { bottom: -7 }),
                      ...(corner.includes('l') ? { left: -7 } : { right: -7 }),
                    }}
                  />
                ))}

                {/* Slot index label */}
                <div style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  background: 'rgba(0,0,0,0.5)',
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 4,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}>
                  {i + 1}
                </div>
              </div>
            );
          })}

          {/* ═══ REGION-BASED (legacy) ═══ */}
          {imageSize && !isSlotted && !isCard && (
            <div
              style={{
                position: "absolute",
                left: (region as any).x,
                top: (region as any).y,
                width: (region as any).width,
                height: (region as any).height,
                border: "2px dashed red",
                background: "rgba(255,0,0,0.05)",
                pointerEvents: "none",
              }}
            />
          )}

          {/* Slot-based items + labels rendered together per card */}
          {!isCard && placements.length > 0 && (
            <RenderFlyerPlacements
              items={items}
              placements={placements}
              discountLabels={discountLabels as any}
              flyerWeekStart={flyerWeekStart}
              replacementJobs={replacementJobs}
              onCancelReplacementJob={onCancelReplacementJob}
            />
          )}

          {/* Slot-based interactive overlays (add/replace buttons) */}
          {imageSize && isSlotted && !isCard && onEnqueue && onRemove && (
            <SlotOverlays
              slots={effectiveSlots}
              items={items}
              placements={placements}
              onAddImage={handleAddImage}
              onReplaceImage={handleReplaceImage}
              onRemoveItem={onRemoveItem}
              onChooseDatabaseResults={onChooseDatabaseResults}
              onGoogleSearch={onGoogleSearch}
              onEditTitle={onEditTitle}
              onPickSeriesFlavors={onPickSeriesFlavors}
              isLocked={isLocked}
            />
          )}
        </div>
      </div>
    </div>
    </>
  );
}
