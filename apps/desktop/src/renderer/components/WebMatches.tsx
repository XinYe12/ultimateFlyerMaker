type Props = {
  matches?: any[];
};

export default function WebMatches({ matches }: Props) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3>Web Matches</h3>

      {matches && matches.length > 0 ? (
        <pre
          style={{
            padding: 12,
            background: "#fafafa",
            border: "1px solid #ddd",
            whiteSpace: "pre-wrap"
          }}
        >
          {JSON.stringify(matches, null, 2)}
        </pre>
      ) : (
        <div>(none)</div>
      )}
    </div>
  );
}
