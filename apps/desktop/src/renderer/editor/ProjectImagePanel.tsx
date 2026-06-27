import React, { useMemo, useState, useCallback } from "react";

const DEPT_LABELS: Record<string, string> = {
  grocery: "Grocery",
  frozen: "Frozen",
  hot_food: "Hot Food",
  sushi: "Sushi",
  meat: "Meat",
  seafood: "Seafood",
  fruit: "Fruit",
  vegetable: "Vegetable",
  hot_sale: "Hot Sale",
  produce: "Produce",
};

export interface PanelImageItem {
  id: string;
  cutoutPath: string | null;
  inputPath: string;
  titleEn: string;
  department: string;
}

interface Props {
  items: PanelImageItem[];
  activeDepartment: string;
  onClose: () => void;
  embedded?: boolean;
}

function PanelThumb({ item, primarySrc, fallbackSrc, onDragStart }: {
  item: PanelImageItem;
  primarySrc: string | null;
  fallbackSrc: string | null;
  onDragStart: (e: React.DragEvent, item: PanelImageItem) => void;
}) {
  const [src, setSrc] = useState(primarySrc);
  const [failed, setFailed] = useState(false);

  const handleError = useCallback(() => {
    if (src === primarySrc && fallbackSrc && fallbackSrc !== primarySrc) {
      setSrc(fallbackSrc);
    } else {
      setFailed(true);
    }
  }, [src, primarySrc, fallbackSrc]);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      title={item.titleEn || undefined}
      style={{
        width: 82, background: "#f9fafb", borderRadius: 6,
        border: "1px solid #e5e7eb", cursor: "grab",
        overflow: "hidden", flexShrink: 0, userSelect: "none",
      }}
    >
      <div style={{
        width: 82, height: 82,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#f3f4f6",
      }}>
        {src && !failed ? (
          <img
            src={src}
            alt={item.titleEn}
            draggable={false}
            onError={handleError}
            style={{ maxWidth: 78, maxHeight: 78, objectFit: "contain", display: "block" }}
          />
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 3, padding: 4,
          }}>
            <span style={{ fontSize: 22, opacity: 0.3 }}>🖼</span>
            {item.titleEn && (
              <span style={{ fontSize: 8, color: "#9ca3af", textAlign: "center", lineHeight: 1.2 }}>
                {item.titleEn.slice(0, 24)}
              </span>
            )}
          </div>
        )}
      </div>
      {item.titleEn && (
        <div style={{
          fontSize: 9, color: "#6b7280", padding: "2px 5px",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          borderTop: "1px solid #e5e7eb",
        }}>
          {item.titleEn}
        </div>
      )}
    </div>
  );
}

export default function ProjectImagePanel({ items, activeDepartment, onClose, embedded }: Props) {
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, PanelImageItem[]>();
    for (const item of items) {
      if (!map.has(item.department)) map.set(item.department, []);
      map.get(item.department)!.push(item);
    }
    // Active department first
    const sorted = new Map<string, PanelImageItem[]>();
    if (map.has(activeDepartment)) sorted.set(activeDepartment, map.get(activeDepartment)!);
    for (const [k, v] of map) {
      if (k !== activeDepartment) sorted.set(k, v);
    }
    return sorted;
  }, [items, activeDepartment]);

  const toggleDept = (dept: string) => {
    setCollapsedDepts(prev => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept); else next.add(dept);
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, item: PanelImageItem) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({
      type: "ufm-panel-image",
      itemId: item.id,
      cutoutPath: item.cutoutPath,
      inputPath: item.inputPath,
      titleEn: item.titleEn,
    }));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div style={{
      width: "100%", height: "100%",
      background: "#fff",
      display: "flex", flexDirection: "column",
      borderRight: "1px solid #dde1e7",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      {!embedded && (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px 8px",
        borderBottom: "1px solid #eaecef",
        flexShrink: 0,
      }}>
        <span style={{
          fontWeight: 700, fontSize: 12, color: "#374151",
          letterSpacing: "0.05em", textTransform: "uppercase",
        }}>
          Image Library
        </span>
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: "0 2px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ×
        </button>
      </div>
      )}

      {/* Hint */}
      <div style={{ padding: "5px 12px 4px", fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>
        Drag an image onto a card to replace it
      </div>

      {/* Scrollable image list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {grouped.size === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 11, textAlign: "center", padding: "24px 12px" }}>
            No processed images yet
          </div>
        ) : (
          [...grouped.entries()].map(([dept, deptItems]) => (
            <div key={dept}>
              <button
                onClick={() => toggleDept(dept)}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 10px", background: "none", border: "none",
                  cursor: "pointer", fontSize: 11, fontWeight: 700,
                  color: dept === activeDepartment ? "#2563eb" : "#6b7280",
                  letterSpacing: "0.03em", textTransform: "uppercase",
                }}
              >
                <span>{DEPT_LABELS[dept] ?? dept}</span>
                <span style={{ fontSize: 9, opacity: 0.5 }}>
                  {collapsedDepts.has(dept) ? "▶" : "▼"}
                </span>
              </button>
              {!collapsedDepts.has(dept) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "2px 8px 8px" }}>
                  {deptItems.map(item => {
                    const toSrc = (p: string | null) =>
                      p ? (p.startsWith("http") ? p : `file://${p}`) : null;
                    const primarySrc = toSrc(item.cutoutPath) ?? toSrc(item.inputPath);
                    const fallbackSrc = item.cutoutPath ? toSrc(item.inputPath) : null;
                    return (
                      <PanelThumb
                        key={item.id}
                        item={item}
                        primarySrc={primarySrc}
                        fallbackSrc={fallbackSrc}
                        onDragStart={handleDragStart}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
