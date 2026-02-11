import type { FlyerJob } from "../types";

type Props = {
  viewingJob: FlyerJob | null;
  onBack: () => void;
  onDeleteDraft: () => void;
};

const styles = {
  toolbar: {
    marginBottom: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  } as const,
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  } as const,
  backBtn: {
    padding: "8px 16px",
    background: "#F1F3F5",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
  } as const,
  jobName: {
    color: "#868E96",
  } as const,
  deleteBtn: {
    padding: "8px 16px",
    background: "#FFE3E3",
    color: "#C92A2A",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
  } as const,
  noJobWrapper: {
    marginBottom: 16,
  } as const,
  backBtnStandalone: {
    padding: "8px 16px",
    background: "#F1F3F5",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 500,
    marginBottom: 12,
  } as const,
  warningBox: {
    padding: 20,
    background: "#FFF3BF",
    borderRadius: 8,
  } as const,
  warningText: {
    margin: 0,
    color: "#E67700",
  } as const,
};

export default function EditorHeader({ viewingJob, onBack, onDeleteDraft }: Props) {
  if (!viewingJob) {
    return (
      <div style={styles.noJobWrapper}>
        <button onClick={onBack} style={styles.backBtnStandalone}>
          Back to Queue
        </button>
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
        <button onClick={onBack} style={styles.backBtn}>
          Back to Queue
        </button>
        <span style={styles.jobName}>Viewing: {viewingJob.name}</span>
      </div>
      {viewingJob.status === "drafting" && (
        <button onClick={onDeleteDraft} style={styles.deleteBtn}>
          Delete Draft
        </button>
      )}
    </div>
  );
}
