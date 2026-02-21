import type { FlyerJob } from "../types";
import Button from "./ui/Button";

type Props = {
  viewingJob: FlyerJob | null;
  onBack: () => void;
  onDeleteDraft: () => void;
};

const styles = {
  toolbar: {
    marginBottom: "var(--space-4)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as const,
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
  } as const,
  jobName: {
    color: "var(--color-text-muted)",
  } as const,
  noJobWrapper: {
    marginBottom: "var(--space-4)",
  } as const,
  warningBox: {
    padding: 20,
    background: "#FFF3BF",
    borderRadius: "var(--radius-md)",
  } as const,
  warningText: {
    margin: 0,
    color: "var(--color-warning)",
  } as const,
};

export default function EditorHeader({ viewingJob, onBack, onDeleteDraft }: Props) {
  if (!viewingJob) {
    return (
      <div style={styles.noJobWrapper}>
        <Button variant="secondary" onClick={onBack} style={{ marginBottom: "var(--space-3)" }}>
          Back to Queue
        </Button>
        <div style={styles.warningBox}>
          <p style={styles.warningText}>
            No job selected. Go to Job Queue to create and process a flyer job.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.toolbar}>
      <div style={styles.toolbarLeft}>
        <Button variant="secondary" onClick={onBack}>
          Back to Queue
        </Button>
        <span style={styles.jobName}>Viewing: {viewingJob.name}</span>
      </div>
      {viewingJob.status === "drafting" && (
        <Button variant="danger" onClick={onDeleteDraft}>
          Delete Draft
        </Button>
      )}
    </div>
  );
}
