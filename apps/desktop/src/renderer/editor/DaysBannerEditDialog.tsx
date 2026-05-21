import { useState } from "react";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";

const CYCLE_DAYS: { key: string; label: string }[] = [
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
];

type Props = {
  itemId: string;
  initialDays: string[];
  onSave: (itemId: string, days: string[]) => void;
  onClose: () => void;
};

export default function DaysBannerEditDialog({ itemId, initialDays, onSave, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialDays));

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSave = () => {
    const days = CYCLE_DAYS.map(d => d.key).filter(k => selected.has(k));
    onSave(itemId, days);
  };

  return (
    <Modal open={true} onOpenChange={(open) => !open && onClose()}>
      <h2
        style={{
          margin: "0 0 var(--space-4)",
          fontSize: "var(--text-xl)",
          fontWeight: "var(--font-semibold)",
          color: "var(--color-text)",
        }}
      >
        Edit promotional days
      </h2>
      <p
        style={{
          color: "var(--color-text-muted)",
          fontSize: "var(--text-sm)",
          marginBottom: "var(--space-4)",
        }}
      >
        Select which days this promotion is active.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {CYCLE_DAYS.map(({ key, label }) => (
          <label
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              fontSize: "var(--text-base)",
              color: "var(--color-text)",
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(key)}
              onChange={() => toggle(key)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            {label}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="button" onClick={handleSave} disabled={selected.size === 0}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
