type Props = {
  active: boolean;
  message: string;
  progressDone?: number;
  progressTotal?: number;
};

export default function EditorAutomationBlocker({
  active,
  message,
  progressDone = 0,
  progressTotal = 0,
}: Props) {
  if (!active) return null;

  const showBar = progressTotal > 0;
  const pct = showBar ? Math.round((progressDone / progressTotal) * 100) : 0;

  return (
    <div
      className="ufm-editor-blocker"
      aria-busy="true"
      aria-live="polite"
      role="presentation"
    >
      <div className="ufm-editor-blocker__panel">
        <div className="ufm-editor-blocker__spin" />
        <p className="ufm-editor-blocker__message">{message}</p>
        {showBar && (
          <>
            <p className="ufm-editor-blocker__progress">
              {progressDone} / {progressTotal} done
            </p>
            <div className="ufm-editor-blocker__bar">
              <div style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
        <p className="ufm-editor-blocker__hint">Please wait — the editor is locked until automation finishes.</p>
      </div>
    </div>
  );
}
