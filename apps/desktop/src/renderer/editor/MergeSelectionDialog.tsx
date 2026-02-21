// FILE: apps/desktop/src/renderer/editor/MergeSelectionDialog.tsx
// ROLE: Modal dialog for choosing which product to keep when merging occupied cells

import React from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

export type MergeCandidate = {
  cardId: string;
  itemId: string;
  title: string;
  cutoutPath?: string;
};

type Props = {
  candidates: MergeCandidate[]; // 2 or more
  onSelect: (keepItemId: string) => void;
  onCancel: () => void;
};

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

export default function MergeSelectionDialog({
  candidates,
  onSelect,
  onCancel,
}: Props) {
  return (
    <Modal open={true} onOpenChange={(open) => !open && onCancel()}>
      <h2
        style={{
          margin: "0 0 var(--space-2)",
          fontSize: "var(--text-xl)",
          fontWeight: "var(--font-bold)",
          color: "var(--color-text)",
        }}
      >
        Merge Cells
      </h2>
      <p
        style={{
          margin: "0 0 24px",
          fontSize: 15,
          color: "var(--color-text-muted)",
        }}
      >
        {candidates.length} cells have products. Choose which one to keep:
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-4)",
        }}
      >
        {candidates.map((candidate, idx) => (
          <button
            key={candidate.cardId}
            onClick={() => onSelect(candidate.itemId)}
            style={{
              flex: "1 1 140px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-3)",
              padding: 20,
              border: "2px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              background: "var(--color-bg-subtle)",
              cursor: "pointer",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-primary)";
              e.currentTarget.style.boxShadow =
                "0 4px 16px rgba(76, 110, 245, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <div
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-semibold)",
                color: "var(--color-primary)",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Keep {ORDINALS[idx] ?? `${idx + 1}th`}
            </div>
            {candidate.cutoutPath && (
              <img
                src={`file://${candidate.cutoutPath}`}
                style={{
                  width: 120,
                  height: 120,
                  objectFit: "contain",
                  borderRadius: "var(--radius-md)",
                  background: "#f0f0f0",
                }}
              />
            )}
            <div
              style={{
                fontSize: "var(--text-base)",
                fontWeight: "var(--font-semibold)",
                color: "var(--color-text)",
                textAlign: "center",
                wordBreak: "break-word",
              }}
            >
              {candidate.title || "(untitled)"}
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20, textAlign: "center" }}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
