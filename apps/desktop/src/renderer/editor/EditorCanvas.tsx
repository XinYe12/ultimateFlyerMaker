// FILE: apps/desktop/src/renderer/editor/EditorCanvas.tsx
// ROLE: render ONLY based on template config (authoritative)

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  loadFlyerTemplateConfig,
  findPageForDepartment,
} from "./loadFlyerTemplateConfig";
import RenderFlyerPlacements from "./RenderFlyerPlacements";
import SlotOverlays from "./SlotOverlays";
import AddImageModal from "./AddImageModal";
import { layoutFlyer, layoutFlyerSlots } from "../../../../shared/flyer/layout/layoutFlyer";
import { isSlottedDepartment, isCardDepartment } from "./loadFlyerTemplateConfig";
import { layoutCardRows, computeCardRects, deriveRowCount, CARD_GAP, CARD_BG } from "../../../../shared/flyer/layout/layoutCardRows";
import { saveDepartmentDraft } from "./draftStorage";
import { IngestItem, CardDef, CardLayout } from "../types";
import MergeSelectionDialog, { MergeCandidate } from "./MergeSelectionDialog";

const PREVIEW_SCALE = 0.5;
const MIN_CARD_WIDTH = 150;

type SlotRect = { x: number; y: number; width: number; height: number };

type GroupDivider = {
  leftCardIds: string[];
  rightCardIds: string[];
  x: number;      // center of the gap (absolute pixels)
  y: number;      // top of combined row range (absolute pixels)
  height: number; // full height of combined row range
};

type GroupVDivider = {
  topCardIds: string[];
  bottomCardIds: string[];
  x: number;      // left of combined x range (absolute pixels)
  y: number;      // center of the gap (absolute pixels)
  width: number;  // full width of combined x range
};

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
  onPickSeriesFlavors,
  onAddItem,
  slotOverrides,
  onSlotOverridesChange,
  cardLayout,
  onCardLayoutChange,
  onRemoveFromQueue,
  rowCount,
  onRowCountChange,
}: {
  editorQueue: any[];
  templateId: string;
  department: string;
  discountLabels?: {
    id: string;
    title?: { en: string; zh: string; size: string; regularPrice: string };
    price?: { display: string; quantity?: number | null; unit?: string; regular?: string };
  }[];
  isLocked?: boolean;
  onEnqueue?: (paths: string[], options?: { slotIndex?: number }) => Promise<void>;
  onRemove?: (id: string) => void;
  onReplaceImage?: (itemId: string) => Promise<void>;
  onRemoveItem?: (id: string) => void;
  onChooseDatabaseResults?: (itemId: string) => void;
  onGoogleSearch?: (itemId: string) => void;
  onEditTitle?: (itemId: string) => void;
  onPickSeriesFlavors?: (itemId: string) => void;
  onAddItem?: (item: IngestItem) => void;
  slotOverrides?: Record<number, SlotRect>;
  onSlotOverridesChange?: (overrides: Record<number, SlotRect>) => void;
  cardLayout?: CardLayout | null;
  onCardLayoutChange?: (layout: CardLayout) => void;
  onRemoveFromQueue?: (id: string) => void;
  rowCount?: number;
  onRowCountChange?: (rows: number) => void;
}) {
  const [config, setConfig] = useState<any | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [addImageModalSlot, setAddImageModalSlot] = useState<number | null>(null);
  const [addImageModalCardId, setAddImageModalCardId] = useState<string | null>(null);
  const [resizingMode, setResizingMode] = useState(false);

  // load template config
  useEffect(() => {
    loadFlyerTemplateConfig(templateId).then(setConfig);
  }, [templateId]);

  // editorQueue is already glued content
  const items = editorQueue;

  // persist draft
  useEffect(() => {
    if (items.length > 0) {
      saveDepartmentDraft(templateId, department, items);
    }
  }, [items, templateId, department]);

  // Escape to exit resizing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && resizingMode) setResizingMode(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [resizingMode]);

  const page = config ? findPageForDepartment(config, department) : null;
  const region = page?.departments?.[department] ?? null;
  const imagePath = page?.imagePath ?? "";

  const isCard = region ? isCardDepartment(region) : false;
  const isSlotted = region ? isSlottedDepartment(region) : false;

  // Exit resizing mode when switching to non-card department
  useEffect(() => {
    if (!isCard && resizingMode) setResizingMode(false);
  }, [isCard, resizingMode]);

  const effectiveRowCount = rowCount ?? (cardLayout ? deriveRowCount(cardLayout) : 3);

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
  } | null>(null);

  // ── Per-element scale drag state ──
  const [elementScaleDrag, setElementScaleDrag] = useState<{
    itemId: string;
    type: 'image' | 'title' | 'price';
    startY: number;
    startScale: number;
  } | null>(null);

  // ── Merge state ──
  const [mergeDialog, setMergeDialog] = useState<{
    candidates: MergeCandidate[];
    onConfirm: (keepItemId: string) => void;
  } | null>(null);

  const [hoveredHMerge, setHoveredHMerge] = useState<number | null>(null);
  const [hoveredVMerge, setHoveredVMerge] = useState<number | null>(null);

  // ── Swap drag state ──
  const scaledCanvasRef = useRef<HTMLDivElement>(null);
  const holdPendingRef = useRef<{
    cardId: string;
    startX: number;
    startY: number;
    timerId: ReturnType<typeof setTimeout>;
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
  const cardPlacements = useMemo(() => {
    if (!page || !region || !isCard || !cardLayout || cardLayout.length === 0) return [];
    const cardRegion = (region as any).region;
    return layoutCardRows({
      cards: cardLayout,
      region: cardRegion,
      pageId: page.pageId,
      regionId: department,
    });
  }, [page, region, isCard, cardLayout, department]);

  // Card rects (for rendering backgrounds of all cards including empty)
  const cardRects = useMemo(() => {
    if (!region || !isCard || !cardLayout || cardLayout.length === 0) return [];
    const cardRegion = (region as any).region;
    return computeCardRects({ cards: cardLayout, region: cardRegion });
  }, [region, isCard, cardLayout]);
  const cardRectsRef = useRef(cardRects);
  cardRectsRef.current = cardRects;

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
  const handleDividerDragStart = useCallback((leftCardId: string, rightCardId: string, e: React.MouseEvent) => {
    if (!onCardLayoutChange || !cardLayout) return;
    e.preventDefault();
    e.stopPropagation();

    const leftCard = cardLayout.find(c => c.id === leftCardId);
    const rightCard = cardLayout.find(c => c.id === rightCardId);
    if (!leftCard || !rightCard) return;

    setDividerDrag({
      leftCardId,
      rightCardId,
      startX: e.clientX,
      leftStartWidth: leftCard.widthPx,
      rightStartWidth: rightCard.widthPx,
    });
  }, [cardLayout, onCardLayoutChange]);

  const handleElementScaleDragStart = useCallback(
    (itemId: string, type: 'image' | 'title' | 'price', startScale: number, e: React.MouseEvent) => {
      if (!onCardLayoutChange) return;
      e.preventDefault();
      e.stopPropagation();
      setElementScaleDrag({ itemId, type, startY: e.clientY, startScale });
    },
    [onCardLayoutChange]
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

    const handleMouseUp = () => {
      setDividerDrag(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dividerDrag, cardLayout, onCardLayoutChange]);

  // Global mouse handlers for per-element scale drag
  useEffect(() => {
    if (!elementScaleDrag || !onCardLayoutChange || !cardLayout) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = cardRectsRef.current.find(r => r.itemId === elementScaleDrag.itemId);
      const refPx = rect ? Math.min(rect.width, rect.height) * PREVIEW_SCALE : 100;
      const delta = (elementScaleDrag.startY - e.clientY) / refPx; // drag up = larger
      const newScale = Math.round(
        Math.min(3.0, Math.max(0.2, elementScaleDrag.startScale + delta)) * 1000
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

  // Global swap drag mouse handlers (registered once — uses refs to avoid stale closures)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Cancel hold if mouse moved too far before timer fired
      if (holdPendingRef.current) {
        const dx = e.clientX - holdPendingRef.current.startX;
        const dy = e.clientY - holdPendingRef.current.startY;
        if (Math.hypot(dx, dy) > 8) {
          clearTimeout(holdPendingRef.current.timerId);
          holdPendingRef.current = null;
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
        clearTimeout(holdPendingRef.current.timerId);
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
    setAddImageModalSlot(slotIndex);
  };

  const handleAddImageToCard = (cardId: string) => {
    setAddImageModalCardId(cardId);
  };

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
      // Enqueue the image (no slotIndex needed for card-based)
      await onEnqueue([filePath]);
    } catch (err) {
      console.error("Failed to enqueue image for card:", err);
    }
  };

  const handleModalItemReady = (item: IngestItem) => {
    onAddItem?.(item);

    // If we were adding to a specific card, link them
    if (addImageModalCardId && cardLayout && onCardLayoutChange) {
      const updated = cardLayout.map(c =>
        c.id === addImageModalCardId ? { ...c, itemId: item.id } : c
      );
      onCardLayoutChange(updated);
    }
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
    if (e.button !== 0 || !onCardLayoutChange || !scaledCanvasRef.current) return;
    if (dividerDrag || activeDrag || elementScaleDrag) return; // don't conflict with other drags

    const canvasRect = scaledCanvasRef.current.getBoundingClientRect();
    const canvasX = (e.clientX - canvasRect.left) / PREVIEW_SCALE;
    const canvasY = (e.clientY - canvasRect.top) / PREVIEW_SCALE;

    // Hit-test: find which card was pressed
    const hit = cardRects.find(r =>
      canvasX >= r.x && canvasX <= r.x + r.width &&
      canvasY >= r.y && canvasY <= r.y + r.height
    );
    if (!hit) return;

    // Cancel any in-flight hold
    if (holdPendingRef.current) {
      clearTimeout(holdPendingRef.current.timerId);
    }

    const { clientX: startX, clientY: startY } = e;
    const cardId = hit.cardId;

    const timerId = setTimeout(() => {
      if (!holdPendingRef.current) return; // cleared by mouseup or movement
      holdPendingRef.current = null;

      // Find closest card at current position
      const canvasRectNow = scaledCanvasRef.current?.getBoundingClientRect();
      let targetCardId: string | null = null;
      if (canvasRectNow) {
        const cx = (startX - canvasRectNow.left) / PREVIEW_SCALE;
        const cy = (startY - canvasRectNow.top) / PREVIEW_SCALE;
        let closestDist = Infinity;
        for (const r of cardRectsRef.current) {
          if (r.cardId === cardId) continue;
          const d = Math.hypot(cx - (r.x + r.width / 2), cy - (r.y + r.height / 2));
          if (d < closestDist) { closestDist = d; targetCardId = r.cardId; }
        }
      }
      setSwapDrag({ cardId, x: startX, y: startY, targetCardId });
    }, 350);

    holdPendingRef.current = { cardId, startX, startY, timerId };
  };

  // Build group dividers — one per minimal matching boundary segment.
  //
  // Strategy: enumerate from each individual card on both sides so that equal-height
  // pairs each get their OWN divider (instead of grouping an entire column together).
  // Deduplication via a Set prevents double-emitting symmetric matches.
  const groupDividers: GroupDivider[] = [];

  if (isCard && cardRects.length > 0 && cardLayout) {
    const cardRegion = (region as any).region;
    const rowCount = deriveRowCount(cardLayout);
    const rowHeight = (cardRegion.height - (rowCount - 1) * CARD_GAP) / rowCount;

    const getRectForCard = (cardId: string) => cardRects.find(r => r.cardId === cardId);
    const emitted = new Set<string>();

    const tryEmit = (leftIds: string[], rightIds: string[]) => {
      const key = [...leftIds].sort().join(',') + '|' + [...rightIds].sort().join(',');
      if (emitted.has(key)) return;
      emitted.add(key);

      const leftCards = leftIds.map(id => cardLayout.find(c => c.id === id)).filter(Boolean) as CardDef[];
      const leftMinRow = Math.min(...leftCards.map(c => c.row));
      const rangeSize = leftCards.reduce((sum, c) => sum + (c.rowSpan ?? 1), 0);

      const anyLeftRect = getRectForCard(leftCards[0].id);
      if (!anyLeftRect) return;

      const y = cardRegion.y + leftMinRow * (rowHeight + CARD_GAP);
      const height = rangeSize * rowHeight + (rangeSize - 1) * CARD_GAP;
      const x = Math.round(anyLeftRect.x + anyLeftRect.width) + CARD_GAP / 2;

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
        if (Math.abs(Math.round(rect.x) - (leftRightEdge + CARD_GAP)) > 1) continue;
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
        if (Math.abs(Math.round(rect.x + rect.width) - (rightLeftEdge - CARD_GAP)) > 1) continue;
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
  const groupVDividers: GroupVDivider[] = [];

  if (isCard && cardRects.length > 0 && cardLayout) {
    const getVRect = (cardId: string) => cardRects.find(r => r.cardId === cardId);
    const emittedV = new Set<string>();

    const tryEmitV = (topIds: string[], bottomIds: string[]) => {
      const key = [...topIds].sort().join(',') + '|' + [...bottomIds].sort().join(',');
      if (emittedV.has(key)) return;
      emittedV.add(key);

      const topCards = topIds.map(id => cardLayout.find(c => c.id === id)).filter(Boolean) as CardDef[];
      const topRects = topCards.map(c => getVRect(c.id)).filter(Boolean) as (typeof cardRects[0])[];
      if (topRects.length === 0) return;

      const xMin = Math.min(...topRects.map(r => r.x));
      const xMax = Math.max(...topRects.map(r => r.x + r.width));
      const anyTopRect = topRects[0];

      groupVDividers.push({
        topCardIds: topIds,
        bottomCardIds: bottomIds,
        x: xMin,
        y: anyTopRect.y + anyTopRect.height + CARD_GAP / 2,
        width: xMax - xMin,
      });
    };

    // Pass 1: for each top card, find bottom cards fully within its x range
    for (const topCard of cardLayout) {
      const topRect = getVRect(topCard.id);
      if (!topRect) continue;

      const bottomRow = topCard.row + (topCard.rowSpan ?? 1);
      const topXMin = Math.round(topRect.x);
      const topXMax = Math.round(topRect.x + topRect.width);

      const bottomCardIds: string[] = [];
      for (const rect of cardRects) {
        const card = cardLayout.find(c => c.id === rect.cardId);
        if (!card || card.row !== bottomRow) continue;
        const cardXMin = Math.round(rect.x);
        const cardXMax = Math.round(rect.x + rect.width);
        if (cardXMin < topXMin - 1 || cardXMax > topXMax + 1) continue;
        bottomCardIds.push(rect.cardId);
      }

      if (bottomCardIds.length === 0) continue;

      // Check that bottom cards together fill the top card's width
      const bottomRects = bottomCardIds.map(id => getVRect(id)).filter(Boolean) as (typeof cardRects[0])[];
      const totalBottomWidth = bottomRects.reduce((sum, r) => sum + r.width, 0)
        + (bottomCardIds.length - 1) * CARD_GAP;
      if (Math.abs(totalBottomWidth - topRect.width) > 2) continue;

      tryEmitV([topCard.id], bottomCardIds);
    }

    // Pass 2: for each bottom card, find top cards fully within its x range
    // (handles wide-bottom / multi-top cases not caught by Pass 1)
    for (const bottomCard of cardLayout) {
      const bottomRect = getVRect(bottomCard.id);
      if (!bottomRect) continue;

      const bottomXMin = Math.round(bottomRect.x);
      const bottomXMax = Math.round(bottomRect.x + bottomRect.width);

      const topCardIds: string[] = [];
      for (const rect of cardRects) {
        const card = cardLayout.find(c => c.id === rect.cardId);
        if (!card || card.row + (card.rowSpan ?? 1) !== bottomCard.row) continue;
        const cardXMin = Math.round(rect.x);
        const cardXMax = Math.round(rect.x + rect.width);
        if (cardXMin < bottomXMin - 1 || cardXMax > bottomXMax + 1) continue;
        topCardIds.push(rect.cardId);
      }

      if (topCardIds.length === 0) continue;

      const topRects2 = topCardIds.map(id => getVRect(id)).filter(Boolean) as (typeof cardRects[0])[];
      const totalTopWidth = topRects2.reduce((sum, r) => sum + r.width, 0)
        + (topCardIds.length - 1) * CARD_GAP;
      if (Math.abs(totalTopWidth - bottomRect.width) > 2) continue;

      tryEmitV(topCardIds, [bottomCard.id]);
    }
  }

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

    // New width = left column width + gap + right column width
    const leftWidth = leftCards[0].widthPx;
    const rightWidth = rightCards[0].widthPx;
    anchor.widthPx = leftWidth + CARD_GAP + rightWidth;

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

  // ── Group merge handler (vertical boundary, N:M cards) ──
  const handleGroupVMergeClick = (topCardIds: string[], bottomCardIds: string[]) => {
    if (!cardLayout || !onCardLayoutChange) return;

    const allIds = [...topCardIds, ...bottomCardIds];
    const allCards = allIds
      .map(id => cardLayout.find(c => c.id === id))
      .filter(Boolean) as CardDef[];
    const withItems = allCards.filter(c => c.itemId);

    if (withItems.length <= 1) {
      executeGroupVMerge(topCardIds, bottomCardIds, withItems[0]?.itemId);
      return;
    }

    const candidates: MergeCandidate[] = withItems.map(c => {
      const item = items.find((it: any) => it.id === c.itemId);
      return { cardId: c.id, itemId: c.itemId!, title: getTitle(item), cutoutPath: getCutout(item) };
    });

    setMergeDialog({
      candidates,
      onConfirm: (keepItemId) => executeGroupVMerge(topCardIds, bottomCardIds, keepItemId),
    });
  };

  // ── Execute group vertical merge ──
  const executeGroupVMerge = (
    topCardIds: string[],
    bottomCardIds: string[],
    keepItemId?: string,
  ) => {
    if (!cardLayout || !onCardLayoutChange) return;

    let updated = cardLayout.map(c => ({ ...c }));

    const topCards = topCardIds
      .map(id => updated.find(c => c.id === id))
      .filter(Boolean) as CardDef[];
    const bottomCards = bottomCardIds
      .map(id => updated.find(c => c.id === id))
      .filter(Boolean) as CardDef[];
    const allCards = [...topCards, ...bottomCards];

    // Anchor = topmost, leftmost card in top group
    const anchor = [...topCards].sort((a, b) => a.row - b.row || a.order - b.order)[0];

    // New rowSpan = top span + bottom span (all top cards share the same rowSpan, same for bottom)
    const topRowSpan = topCards[0].rowSpan ?? 1;
    const bottomRowSpan = bottomCards[0].rowSpan ?? 1;
    anchor.rowSpan = topRowSpan + bottomRowSpan;

    // If multiple top cards, widen anchor to cover full combined width
    if (topCards.length > 1) {
      const sortedTop = [...topCards].sort((a, b) => a.order - b.order);
      anchor.widthPx = sortedTop.reduce((sum, c) => sum + c.widthPx, 0)
        + (topCards.length - 1) * CARD_GAP;
    }
    // else: topCards.length === 1 — widthPx already covers full width

    anchor.itemId = keepItemId;

    // Dropped item IDs
    const droppedItemIds = allCards
      .filter(c => c.id !== anchor.id && c.itemId && c.itemId !== keepItemId)
      .map(c => c.itemId!);

    // Remove all cards in both groups except anchor
    const allIdSet = new Set([...topCardIds, ...bottomCardIds]);
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
      // Add right card's width + gap to left card
      cardA.widthPx = cardA.widthPx + CARD_GAP + cardB.widthPx;
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

    {/* AddImageModal for slot-based */}
    {addImageModalSlot !== null && (
      <AddImageModal
        slotIndex={addImageModalSlot}
        onLocalFile={handleModalLocalFile}
        onItemReady={handleModalItemReady}
        onClose={() => setAddImageModalSlot(null)}
      />
    )}

    {/* AddImageModal for card-based */}
    {addImageModalCardId !== null && (
      <AddImageModal
        slotIndex={-1}
        onLocalFile={(_slot, filePath) => handleModalLocalFileForCard(addImageModalCardId!, filePath)}
        onItemReady={handleModalItemReady}
        onClose={() => setAddImageModalCardId(null)}
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

    {isCard && onRowCountChange && (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'center',
        marginBottom: 6,
        fontSize: 13,
        color: '#555',
      }}>
        <span>Rows:</span>
        <button
          onClick={() => onRowCountChange(Math.max(1, effectiveRowCount - 1))}
          style={{ width: 24, height: 24, cursor: 'pointer', borderRadius: 4, border: '1px solid #ccc' }}
        >−</button>
        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 600 }}>
          {effectiveRowCount}
        </span>
        <button
          onClick={() => onRowCountChange(effectiveRowCount + 1)}
          style={{ width: 24, height: 24, cursor: 'pointer', borderRadius: 4, border: '1px solid #ccc' }}
        >+</button>
      </div>
    )}

    <div
      key={page.pageId} // hard reset per page
      style={{ marginTop: 24, display: "flex", justifyContent: "center", position: "relative" }}
    >
      {/* Exit resizing mode button — top-right, only when resizing */}
      {isCard && resizingMode && (
        <button
          onClick={() => setResizingMode(false)}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 10000,
            padding: "10px 20px",
            background: "linear-gradient(135deg, #667eea, #764ba2)",
            color: "#fff",
            border: "2px solid rgba(255,255,255,0.9)",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
          }}
          title="Exit resizing mode"
        >
          ✕ Exit
        </button>
      )}
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
          }}
          onMouseDown={isCard && onCardLayoutChange ? handleCanvasMouseDown : undefined}
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

          {/* ═══ CARD-BASED DEPARTMENT ═══ */}
          {imageSize && isCard && (
            <>
              {/* Grey card backgrounds */}
              {cardRects.map((rect) => (
                <div
                  key={`card-bg-${rect.cardId}`}
                  style={{
                    position: "absolute",
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: rect.height,
                    background: CARD_BG,
                    boxSizing: "border-box",
                  }}
                />
              ))}

              {/* Product content on filled cards */}
              {cardPlacements.length > 0 && (
                <RenderFlyerPlacements
                  items={items}
                  placements={cardPlacements}
                  discountLabels={discountLabels as any}
                  onElementDragStart={onCardLayoutChange && resizingMode ? handleElementScaleDragStart : undefined}
                />
              )}

              {/* Card overlays (add/replace/edit/delete buttons) — disabled during swap drag */}
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
                  onEnterResizingMode={isLocked ? undefined : () => setResizingMode(true)}
                  resizingMode={resizingMode}
                  cardMode
                  cardRects={cardRects}
                  cardLayout={cardLayout ?? undefined}
                  isLocked={isLocked}
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

              {/* Divider drag handles + horizontal merge buttons */}
              {onCardLayoutChange && groupDividers.map((d, idx) => {
                const is1to1 = d.leftCardIds.length === 1 && d.rightCardIds.length === 1;
                return (
                  <div
                    key={`divider-${idx}`}
                    onMouseEnter={() => setHoveredHMerge(idx)}
                    onMouseLeave={() => setHoveredHMerge(null)}
                    style={{
                      position: "absolute",
                      left: d.x - 10,
                      top: d.y,
                      width: 20,
                      height: d.height,
                      zIndex: 50,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {/* Drag handle zone — only for 1:1 equal-height boundaries */}
                    {is1to1 && (
                      <div
                        onMouseDown={(e) => handleDividerDragStart(d.leftCardIds[0], d.rightCardIds[0], e)}
                        style={{
                          position: "absolute",
                          left: 6,
                          top: 0,
                          width: 8,
                          height: "100%",
                          cursor: "col-resize",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <div style={{
                          width: 3,
                          height: "60%",
                          background: dividerDrag?.leftCardId === d.leftCardIds[0]
                            ? "#4C6EF5"
                            : "rgba(0,0,0,0.2)",
                          borderRadius: 2,
                          transition: dividerDrag ? "none" : "background 0.2s",
                        }} />
                      </div>
                    )}

                    {/* Horizontal merge button — one per boundary, centered on full height */}
                    {hoveredHMerge === idx && !dividerDrag && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGroupMergeClick(d.leftCardIds, d.rightCardIds);
                        }}
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%)",
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: "#4C6EF5",
                          color: "#fff",
                          border: "2px solid #fff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                          fontWeight: 700,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                          zIndex: 60,
                          padding: 0,
                          lineHeight: 1,
                        }}
                        title="Merge cells horizontally"
                      >
                        ⟷
                      </button>
                    )}
                  </div>
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

              {/* Vertical merge buttons */}
              {onCardLayoutChange && groupVDividers.map((vd, idx) => (
                <div
                  key={`vdivider-${idx}`}
                  onMouseEnter={() => setHoveredVMerge(idx)}
                  onMouseLeave={() => setHoveredVMerge(null)}
                  style={{
                    position: "absolute",
                    left: vd.x,
                    top: vd.y - 20,
                    width: vd.width,
                    height: 40,
                    zIndex: 55,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {hoveredVMerge === idx && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGroupVMergeClick(vd.topCardIds, vd.bottomCardIds);
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#4C6EF5",
                        color: "#fff",
                        border: "2px solid #fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                        zIndex: 60,
                        padding: 0,
                        lineHeight: 1,
                      }}
                      title="Merge cells vertically"
                    >
                      ⇕
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {/* ═══ SLOT-BASED DEPARTMENT ═══ */}
          {imageSize && isSlotted && effectiveSlots.map((slot: SlotRect, i: number) => {
            const isDragging = activeDrag?.slotIndex === i && activeDrag.thresholdMet;
            return (
              <div
                key={`slot-${i}`}
                onMouseDown={onSlotOverridesChange ? (e => handleSlotDragStart(i, e)) : undefined}
                style={{
                  position: "absolute",
                  left: slot.x,
                  top: slot.y,
                  width: slot.width,
                  height: slot.height,
                  border: isDragging ? "2px solid #4C6EF5" : "2px dashed rgba(255,0,0,0.4)",
                  background: isDragging ? "rgba(76,110,245,0.08)" : "rgba(255,0,0,0.03)",
                  cursor: onSlotOverridesChange ? (isDragging ? "grabbing" : "grab") : "default",
                  zIndex: isDragging ? 1000 : undefined,
                  boxShadow: isDragging ? "0 8px 32px rgba(0,0,0,0.2)" : undefined,
                  boxSizing: "border-box",
                }}
              >
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
                      zIndex: 10,
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
