import CutoutPreview from "./components/CutoutPreview";
import DbMatches from "./components/DbMathches";
import WebMatches from "./components/WebMatches";
import { IngestItem } from "./types";

export default function IngestResultView({
  item,
  updateItem,
}: {
  item: IngestItem;
  updateItem: (id: string, patch: Partial<IngestItem>) => void;
}) {
  if (item.status === "error") {
    return <pre style={{ color: "#a00" }}>{item.error}</pre>;
  }

  if (item.status !== "done" || !item.result) return null;

  const { title, aiTitle } = item.result;

  return (
    <div style={{ marginBottom: 32 }}>
      {/* ---------- TITLE EDITOR (AUTHORITATIVE) ---------- */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontWeight: 700 }}>Product Title</label>

        <input
          value={title.en}
          placeholder="Enter product title"
          onChange={(e) =>
            updateItem(item.id, {
              result: {
                ...item.result!,
                title: {
                  ...title,
                  en: e.target.value,
                },
              },
              userEdited: { ...item.userEdited, title: true },
              titleReplaceBackup: undefined,
            })
          }
        />

        {/* ---------- AI SUGGESTION ---------- */}
        {aiTitle?.en &&
          aiTitle.en !== title.en &&
          !item.titleReplaceBackup && (
            <button
              style={{
                display: "block",
                marginTop: 6,
                padding: 0,
                border: "none",
                background: "transparent",
                color: "green",
                fontStyle: "italic",
                fontSize: 12,
                cursor: "pointer",
                textAlign: "left",
              }}
              onClick={() =>
                updateItem(item.id, {
                  titleReplaceBackup: {
                    en: title.en,
                    zh: title.zh,
                  },
                  result: {
                    ...item.result!,
                    title: {
                      ...title,
                      en: aiTitle.en,
                      zh: aiTitle.zh || "",
                    },
                  },
                })
              }
            >
              Use AI suggestion: {aiTitle.en}
            </button>
          )}

        {/* ---------- CANCEL AI REPLACE ---------- */}
        {item.titleReplaceBackup && (
          <button
            style={{
              display: "block",
              marginTop: 6,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#666",
              fontSize: 12,
              cursor: "pointer",
              textDecoration: "underline",
            }}
            onClick={() =>
              updateItem(item.id, {
                result: {
                  ...item.result!,
                  title: {
                    ...title,
                    en: item.titleReplaceBackup!.en,
                    zh: item.titleReplaceBackup!.zh || "",
                  },
                },
                titleReplaceBackup: undefined,
              })
            }
          >
            Cancel AI replace
          </button>
        )}
      </div>
      
      {item.result.matchConfidence && (
        <div
          style={{
            marginTop: 6,
            padding: "4px 8px",
            fontSize: 12,
            background:
              item.result.matchConfidence === "high"
                ? "#e6fffa"
                : item.result.matchConfidence === "low"
                ? "#fff4e5"
                : "#f5f5f5",
            border: "1px solid #ddd",
          }}
        >
          <div>
            <strong>Match confidence:</strong>{" "}
            {item.result.matchConfidence}
          </div>
          <div>
            <strong>Score:</strong>{" "}
            {(item.result.matchScore ?? 0).toFixed(3)}
          </div>
          <div>
            <strong>Matched discount:</strong>{" "}
            {item.result.discount?.en ||
              item.result.discount?.english_name ||
              "(none)"}
          </div>
        </div>
      )}

      {/* ---------- IMAGE / DEBUG ---------- */}
      {item.result.cutoutPath && (
        <CutoutPreview cutoutPath={item.result.cutoutPath} />
      )}


      <DbMatches matches={item.result.dbMatches} />
      <WebMatches matches={item.result.webMatches} />
    </div>
  );
}
