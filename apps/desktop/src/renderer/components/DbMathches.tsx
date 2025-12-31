type Props = {
  matches?: any[];
};

function stripEmbeddings(obj: any) {
  if (!obj || typeof obj !== "object") return obj;

  const { embedding, embeddings, vector, ...rest } = obj;
  return rest;
}

export default function DbMatches({ matches }: Props) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3>DB Matches</h3>

      {matches && matches.length > 0 ? (
        <pre
          style={{
            padding: 12,
            background: "#fafafa",
            border: "1px solid #ddd",
            whiteSpace: "pre-wrap"
          }}
        >
          {JSON.stringify(
            matches.map(stripEmbeddings),
            null,
            2
          )}
        </pre>
      ) : (
        <div>(none)</div>
      )}
    </div>
  );
}
