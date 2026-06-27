import { CardLayout, DiscountLabel, IngestItem, IngestResult } from '../types';

// Fields from IngestResult that are mutable after initial ingest (excludes heavy OCR/AI data)
type SlimResult = Omit<IngestResult, 'ocr' | 'llmResult' | 'dbMatches' | 'webMatches'>;

export type SlimQueueItem = {
  id: string;
  path: string;
  status: string;
  error?: string;
  slotIndex?: number;
  userEdited?: { title?: boolean; price?: boolean; image?: boolean; size?: boolean };
  titleReplaceBackup?: { en: string; zh?: string; size?: string };
  result?: SlimResult;
};

export type EditorSnapshot = {
  cardLayouts: Record<string, CardLayout>;
  slotOverrides: Record<number, { x: number; y: number; width: number; height: number }>;
  userRowCounts: Record<string, number>;
  discountLabels: DiscountLabel[];
  /** Slim view of each queue item — excludes heavy OCR/AI match data to keep memory bounded */
  queueItems: SlimQueueItem[];
};

export type HistoryEntry = {
  id: string;
  label: string;
  departments: string[];
  timestamp: number;
  snapshot: EditorSnapshot;
};

export function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function captureSnapshot(
  cardLayouts: Record<string, CardLayout>,
  slotOverrides: Record<number, { x: number; y: number; width: number; height: number }>,
  userRowCounts: Record<string, number>,
  editorQueue: IngestItem[],
  discountLabels: DiscountLabel[] = [],
): EditorSnapshot {
  return {
    cardLayouts: JSON.parse(JSON.stringify(cardLayouts)),
    slotOverrides: JSON.parse(JSON.stringify(slotOverrides)),
    userRowCounts: { ...userRowCounts },
    discountLabels: JSON.parse(JSON.stringify(discountLabels)),
    queueItems: editorQueue.map(item => ({
      id: item.id,
      path: item.path,
      status: item.status,
      error: item.error,
      slotIndex: item.slotIndex,
      userEdited: item.userEdited ? { ...item.userEdited } : undefined,
      titleReplaceBackup: item.titleReplaceBackup ? { ...item.titleReplaceBackup } : undefined,
      result: item.result
        ? {
            inputPath: item.result.inputPath,
            cutoutPath: item.result.cutoutPath,
            cutoutPaths: item.result.cutoutPaths ? [...item.result.cutoutPaths] : undefined,
            allFlavorPaths: item.result.allFlavorPaths ? [...item.result.allFlavorPaths] : undefined,
            pendingFlavorSelection: item.result.pendingFlavorSelection,
            subImageOverrides: item.result.subImageOverrides
              ? JSON.parse(JSON.stringify(item.result.subImageOverrides))
              : undefined,
            layout: item.result.layout,
            titleImagePath: item.result.titleImagePath,
            priceImagePath: item.result.priceImagePath,
            title: item.result.title,
            aiTitle: item.result.aiTitle,
            discount: item.result.discount,
            matchScore: item.result.matchScore,
            matchSource: item.result.matchSource,
            matchConfidence: item.result.matchConfidence,
            sourceUrl: item.result.sourceUrl,
          }
        : undefined,
    })),
  };
}

/**
 * Produces the IngestItem array that should replace the current queue when restoring a snapshot.
 * Items still in the current queue are merged (mutable fields restored, heavy OCR data kept).
 * Items that were removed since the snapshot are restored from slim data.
 */
export function applySnapshotToQueue(
  snapshot: EditorSnapshot,
  currentQueue: IngestItem[],
): IngestItem[] {
  const currentMap = new Map(currentQueue.map(i => [i.id, i]));

  return snapshot.queueItems.map(slim => {
    const live = currentMap.get(slim.id);
    if (live) {
      return {
        ...live,
        status: slim.status as IngestItem['status'],
        error: slim.error,
        slotIndex: slim.slotIndex,
        userEdited: slim.userEdited,
        titleReplaceBackup: slim.titleReplaceBackup,
        result: slim.result
          ? { ...(live.result ?? {} as any), ...slim.result }
          : live.result,
      };
    }
    // Item was removed — restore from slim data (no OCR/match fields, but display works)
    return {
      id: slim.id,
      path: slim.path,
      status: slim.status as IngestItem['status'],
      error: slim.error,
      slotIndex: slim.slotIndex,
      userEdited: slim.userEdited,
      titleReplaceBackup: slim.titleReplaceBackup,
      result: slim.result as IngestResult | undefined,
    };
  });
}
