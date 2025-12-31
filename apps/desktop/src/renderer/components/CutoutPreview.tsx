type Props = {
  cutoutPath?: string;
};

export default function CutoutPreview({ cutoutPath }: Props) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3>Cutout Preview</h3>

      {cutoutPath ? (
        <img
          src={`file://${cutoutPath}`}
          style={{
            maxWidth: 300,
            border: "1px solid #ddd",
            background: "#fff"
          }}
        />
      ) : (
        <div>(none)</div>
      )}
    </div>
  );
}
