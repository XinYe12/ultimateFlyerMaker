type Props = {
  ocr?: Array<{ rec_texts: string[]; rec_scores?: number[] }>;
};

export default function OcrResult({ ocr }: Props) {
  const lines =
    Array.isArray(ocr) && Array.isArray(ocr[0]?.rec_texts)
      ? ocr[0].rec_texts
      : [];

  return (
    <div style={{ marginTop: 24 }}>
      <h3>OCR</h3>
      <pre
        style={{
          padding: 12,
          background: "#fafafa",
          border: "1px solid #ddd",
          whiteSpace: "pre-wrap",
        }}
      >
        {lines.join("\n")}
      </pre>
    </div>
  );
}
