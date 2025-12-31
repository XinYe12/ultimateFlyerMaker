type Props = {
  ocr?: { text?: string };
  title?: string;
};

export default function OcrResult({ ocr, title }: Props) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3>OCR</h3>

      {title && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            background: "#e8f5e9",
            border: "1px solid #a5d6a7",
            fontWeight: 600
          }}
        >
          {title}
        </div>
      )}

      {ocr?.text ? (
        <pre
          style={{
            padding: 12,
            background: "#fafafa",
            border: "1px solid #ddd",
            whiteSpace: "pre-wrap"
          }}
        >
          {ocr.text}
        </pre>
      ) : (
        <div>(no OCR text)</div>
      )}
    </div>
  );
}
