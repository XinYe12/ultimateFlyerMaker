import { useState } from "react";

type ElectronFile = File & {
  path: string;
};

type Result = {
  input: string;
  output: string;
  seconds: string;
};

export default function App() {
  const [logs, setLogs] = useState<Result[]>([]);
  const [total, setTotal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {

    e.preventDefault();
    console.log("DROP EVENT FIRED");
    if (busy) return;

    const files = Array.from(e.dataTransfer.files) as ElectronFile[];
    const paths = files
      .map(f => f.path)
      .filter(p => /\.(jpg|jpeg|png)$/i.test(p));

    if (paths.length === 0) return;

    setBusy(true);
    setLogs([]);
    setTotal(null);
    console.log("SENDING PATHS:", paths);

    const res = await (window as any).cutoutAPI.batchCutout(paths);

    setLogs(res.results);
    setTotal(res.totalSeconds);
    setBusy(false);
  };

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={onDrop}
      style={{ height: "100vh", padding: 40, background: "#f5f5f5" }}
    >
      <h1>Batch Image CUTOUT</h1>

      <div
        style={{
          border: "3px dashed #999",
          padding: 40,
          marginTop: 20,
          background: "#fff",
          opacity: busy ? 0.5 : 1
        }}
      >
        {busy ? "Processing…" : "Drag & drop images here"}
      </div>

      {logs.length > 0 && (
        <>
          <h3 style={{ marginTop: 30 }}>Results</h3>
          <ul>
            {logs.map((l, i) => (
              <li key={i}>
                {l.input.split("/").pop()} → {l.seconds}s
              </li>
            ))}
          </ul>
          <strong>Total time: {total}s</strong>
        </>
      )}
    </div>
  );
}
