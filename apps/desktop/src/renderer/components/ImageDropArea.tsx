import "../styles/newspaper.css";

type Props = {
  busy?: boolean;
  onDrop: (files: any[]) => void;
};

export default function ImageDropArea({ busy, onDrop }: Props) {
  return (
    <div
      className="card"
      style={{ marginTop: 32 }}
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        if (busy) return;
        onDrop(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="section">
        <label
          style={{
            border: "3px solid #000",
            padding: 24,
            textAlign: "center",
            fontWeight: 900,
            textTransform: "uppercase",
            cursor: busy ? "not-allowed" : "pointer",
            background: busy ? "#eee" : "#fff",
            display: "block"
          }}
        >
          {busy ? "Processing Image…" : "Drop Product Images Here"}

          <div
            style={{
              fontSize: 12,
              fontWeight: 400,
              marginTop: 8
            }}
          >
            JPG · PNG · JPEG (multiple allowed)
          </div>

          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={busy}
            onChange={e => {
              if (!e.target.files || busy) return;
              onDrop(Array.from(e.target.files));
            }}
          />
        </label>
      </div>
    </div>
  );
}
