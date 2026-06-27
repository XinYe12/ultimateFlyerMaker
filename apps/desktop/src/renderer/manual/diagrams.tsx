import React from "react";
import type { DiagramKey } from "./manualContent";

type Props = { diagram: DiagramKey };

const frame: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  margin: "0 auto",
  border: "1.5px solid #e2e8f0",
  borderRadius: 12,
  background: "#f8fafc",
  overflow: "hidden",
};

function Label({ x, y, text, fill = "#64748b", size = 10 }: { x: number; y: number; text: string; fill?: string; size?: number }) {
  return (
    <text x={x} y={y} fill={fill} fontSize={size} fontFamily="Inter, system-ui, sans-serif" fontWeight={600}>
      {text}
    </text>
  );
}

function Box({ x, y, w, h, fill = "#fff", stroke = "#cbd5e1", rx = 6 }: { x: number; y: number; w: number; h: number; fill?: string; stroke?: string; rx?: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth={1.2} />;
}

function OverviewDiagram() {
  return (
    <svg viewBox="0 0 360 200" style={frame}>
      <Box x={20} y={20} w={150} h={90} stroke="#4C6EF5" />
      <Label x={35} y={45} text="Make a Flyer" fill="#4C6EF5" size={11} />
      <Label x={35} y={65} text="Upload discounts," />
      <Label x={35} y={80} text="match products," />
      <Label x={35} y={95} text="export PDF" />
      <Box x={190} y={20} w={150} h={90} stroke="#22c55e" />
      <Label x={205} y={45} text="Product Library" fill="#22c55e" size={11} />
      <Label x={205} y={70} text="(admin — not" />
      <Label x={205} y={85} text="covered here)" fill="#94a3b8" />
      <rect x={20} y={130} width={320} height={28} rx={6} fill="#fff" stroke="#e2e8f0" />
      <Label x={130} y={148} text="Open Log    Settings    User Manual" size={9} />
      <path d="M95 110 L95 130" stroke="#4C6EF5" strokeWidth={1.5} markerEnd="url(#arrow)" />
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#4C6EF5" />
        </marker>
      </defs>
      <Label x={20} y={185} text="Start here → Make a Flyer" fill="#4C6EF5" size={10} />
    </svg>
  );
}

function TemplateDiagram() {
  return (
    <svg viewBox="0 0 360 200" style={frame}>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Box x={20 + i * 110} y={30} w={95} h={110} stroke={i === 0 ? "#4C6EF5" : "#e2e8f0"} />
          <rect x={30 + i * 110} y={42} width={75} height={55} rx={4} fill="#eef2ff" />
          <Label x={38 + i * 110} y={115} text={i === 0 ? "Weekly v1" : i === 1 ? "Weekly v2" : "Custom"} size={10} />
        </g>
      ))}
      <rect x={20} y={30} width={95} height={110} rx={6} fill="none" stroke="#4C6EF5" strokeWidth={2} strokeDasharray="4 2" />
      <Label x={20} y={165} text="Click a template → Job Queue" fill="#4C6EF5" size={10} />
    </svg>
  );
}

function QueueDiagram() {
  const depts = ["Grocery", "Meat", "Produce", "Frozen"];
  return (
    <svg viewBox="0 0 360 200" style={frame}>
      <rect x={20} y={16} width={320} height={24} rx={6} fill="#fff" stroke="#e2e8f0" />
      <Label x={30} y={32} text="Flyer week: Jun 27 – Jul 3" size={10} />
      {depts.map((d, i) => (
        <g key={d}>
          <Box x={20 + (i % 2) * 165} y={55 + Math.floor(i / 2) * 58} w={150} h={48} stroke={i === 0 ? "#4C6EF5" : "#e2e8f0"} />
          <Label x={32 + (i % 2) * 165} y={75 + Math.floor(i / 2) * 58} text={d} size={11} />
          <Label x={32 + (i % 2) * 165} y={92 + Math.floor(i / 2) * 58} text={i === 0 ? "Not started" : i === 1 ? "In progress" : i === 2 ? "Done" : "Locked"} fill="#94a3b8" size={9} />
        </g>
      ))}
      <Label x={20} y={185} text="Click a department card to upload" fill="#4C6EF5" size={10} />
    </svg>
  );
}

function UploadDiagram() {
  return (
    <svg viewBox="0 0 360 200" style={frame}>
      <Box x={20} y={20} w={320} h={160} />
      <Label x={30} y={42} text="Job: Grocery — Week 26" size={11} />
      <rect x={30} y={52} width={140} height={50} rx={6} fill="#f1f5f9" stroke="#cbd5e1" strokeDasharray="4 3" />
      <Label x={50} y={82} text="Drop images here" fill="#64748b" size={10} />
      <rect x={180} y={52} width={150} height={50} rx={6} fill="#f1f5f9" stroke="#cbd5e1" />
      <Label x={195} y={72} text="Paste discounts or" size={9} />
      <Label x={195} y={86} text="upload .xlsx" size={9} />
      <rect x={30} y={115} width={100} height={28} rx={6} fill="#4C6EF5" />
      <Label x={48} y={133} text="Queue Job" fill="#fff" size={10} />
      <Label x={20} y={195} text="Provide discounts + optional photos" fill="#4C6EF5" size={10} />
    </svg>
  );
}

function ProcessingDiagram() {
  return (
    <svg viewBox="0 0 360 200" style={frame}>
      <Box x={20} y={20} w={320} h={140} fill="#f1f5f9" />
      <rect x={40} y={50} width={280} height={80} rx={8} fill="#e2e8f0" opacity={0.7} />
      <Label x={120} y={95} text="Editor locked" fill="#64748b" size={12} />
      <rect x={40} y={130} width={200} height={8} rx={4} fill="#e2e8f0" />
      <rect x={40} y={130} width={120} height={8} rx={4} fill="#4C6EF5" />
      <Label x={250} y={138} text="12 / 20" size={9} />
      <rect x={260} y={125} width={60} height={22} rx={5} fill="#dc2626" />
      <Label x={272} y={140} text="Abort" fill="#fff" size={9} />
    </svg>
  );
}

function EditorDiagram() {
  return (
    <svg viewBox="0 0 360 200" style={frame}>
      <rect x={20} y={16} width={320} height={28} rx={6} fill="#fff" stroke="#e2e8f0" />
      <Label x={28} y={34} text="☰ Grocery  |  ▤ Images  |  ✓ Verify  |  🔒 Lock" size={8} />
      <rect x={20} y={52} width={70} height={120} rx={6} fill="#fff" stroke="#e2e8f0" />
      <Label x={32} y={72} text="Images" size={9} />
      <rect x={100} y={52} width={240} height={120} rx={6} fill="#fff" stroke="#e2e8f0" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={110 + i * 72} y={70} width={60} height={70} rx={4} fill="#eef2ff" stroke="#93c5fd" />
      ))}
      <Label x={100} y={185} text="Rows − 2 +   Cols − 3 +   ⇄ Flip" size={9} fill="#64748b" />
    </svg>
  );
}

function VerifyDiagram() {
  return (
    <svg viewBox="0 0 360 200" style={frame}>
      <rect x={20} y={16} width={320} height={168} rx={8} fill="#1e293b" opacity={0.92} />
      <rect x={40} y={36} width={280} height={24} rx={4} fill="#334155" />
      {["TITLE", "IMAGE", "PRICE"].map((s, i) => (
        <g key={s}>
          <rect x={50 + i * 88} y={40} width={72} height={16} rx={3} fill={i === 0 ? "#4C6EF5" : "#475569"} />
          <Label x={58 + i * 88} y={52} text={s} fill="#fff" size={8} />
        </g>
      ))}
      <rect x={60} y={75} width={100} height={80} rx={4} fill="#475569" />
      <Label x={180} y={95} text="Organic Milk 2%" fill="#fff" size={10} />
      <Label x={180} y={115} text="$3.99" fill="#86efac" size={12} />
      <rect x={180} y={130} width={70} height={22} rx={4} fill="#22c55e" />
      <Label x={195} y={145} text="Approve" fill="#fff" size={9} />
    </svg>
  );
}

function LockDiagram() {
  return (
    <svg viewBox="0 0 360 200" style={frame}>
      {["Grocery", "Meat", "Produce", "Frozen"].map((d, i) => (
        <g key={d}>
          <Box x={20 + (i % 2) * 165} y={30 + Math.floor(i / 2) * 55} w={150} h={42} stroke={i < 3 ? "#22c55e" : "#e2e8f0"} />
          <Label x={32 + (i % 2) * 165} y={50 + Math.floor(i / 2) * 55} text={d} size={10} />
          <Label x={32 + (i % 2) * 165} y={64 + Math.floor(i / 2) * 55} text={i < 3 ? "🔒 Locked" : "In progress"} fill={i < 3 ? "#22c55e" : "#94a3b8"} size={9} />
        </g>
      ))}
      <rect x={100} y={155} width={160} height={28} rx={6} fill="#dc2626" />
      <Label x={118} y={173} text="🔒 Lock Department" fill="#fff" size={10} />
    </svg>
  );
}

function ExportDiagram() {
  return (
    <svg viewBox="0 0 360 200" style={frame}>
      <Box x={60} y={30} w={240} h={140} />
      <Label x={130} y={55} text="Export Flyer" size={12} />
      <rect x={90} y={75} width={180} height={10} rx={5} fill="#e2e8f0" />
      <rect x={90} y={75} width={130} height={10} rx={5} fill="#4C6EF5" />
      <Label x={130} y={105} text="Preparing flyer…" size={10} />
      <rect x={20} y={16} width={320} height={8} rx={0} fill="transparent" />
      {["Choose Template", "Upload", "Verified", "Export PDF"].map((s, i) => (
        <g key={s}>
          <circle cx={40 + i * 90} cy={12} r={8} fill={i < 3 ? "#22c55e" : "#f59e0b"} />
          <Label x={28 + i * 90} y={28} text={s.split(" ")[0]} size={7} fill="#64748b" />
        </g>
      ))}
    </svg>
  );
}

const DIAGRAMS: Record<DiagramKey, React.FC> = {
  overview: OverviewDiagram,
  template: TemplateDiagram,
  queue: QueueDiagram,
  upload: UploadDiagram,
  processing: ProcessingDiagram,
  editor: EditorDiagram,
  verify: VerifyDiagram,
  lock: LockDiagram,
  export: ExportDiagram,
};

export default function ManualDiagram({ diagram }: Props) {
  const Component = DIAGRAMS[diagram];
  return <Component />;
}
