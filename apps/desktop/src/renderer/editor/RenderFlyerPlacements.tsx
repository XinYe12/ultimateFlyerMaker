import { buildFlyerCard } from "../../../../shared/flyer/models/buildFlyerCard";

export default function RenderFlyerPlacements({
  items,
  placements,
}: {
  items: any[];
  placements: any[];
}) {
  return (
    <>
      {placements.map((p) => {
        const item = items.find(it => it.id === p.itemId);
        if (!item) return null;

        const card = buildFlyerCard(p);

        const imgSrc =
          item.image.src.startsWith("http") || item.image.src.startsWith("file://")
            ? item.image.src
            : `file://${item.image.src}`;

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
              background: "transparent",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: card.image.x - p.x,
                top: card.image.y - p.y,
                width: card.image.width,
                height: card.image.height,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <img
                src={imgSrc}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
