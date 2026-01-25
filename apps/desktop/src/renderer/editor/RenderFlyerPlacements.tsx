// PATH: apps/desktop/src/renderer/editor/RenderFlyerPlacements.tsx
// REAL RENDERER — placements are authoritative

export default function RenderFlyerPlacements({
  items,
  placements,
}: {
  items: any[];
  placements: any[];
}) {
  if (!Array.isArray(items) || !Array.isArray(placements)) return null;

  return (
    <>
      {placements.map((p) => {
        const item = items.find((it) => it.id === p.itemId);
        if (!item) return null;

        const rawSrc =
          item?.image?.src ??
          item?.cutoutPath ??
          item?.result?.cutoutPath ??
          null;

        if (!rawSrc) return null;

        const imgSrc =
          rawSrc.startsWith("http") || rawSrc.startsWith("file://")
            ? rawSrc
            : `file://${rawSrc}`;

        return (
          <div
            key={p.itemId}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: p.width,
              height: p.height,
              overflow: "hidden",
            }}
          >
            <img
              src={imgSrc}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          </div>
        );
      })}
    </>
  );
}
