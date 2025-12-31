import React from "react";

type ElectronFile = File & { path: string };

type Props = {
  busy?: boolean;
  onDrop: (files: ElectronFile[]) => void;
};

export default function ImageDropArea({ busy = false, onDrop }: Props) {
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (busy) return;

    const files = Array.from(e.dataTransfer.files) as ElectronFile[];
    onDrop(files);
  };

  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      style={{
        border: "3px dashed #999",
        padding: 40,
        marginTop: 20,
        background: "#fff",
        opacity: busy ? 0.5 : 1,
        userSelect: "none"
      }}
    >
      {busy ? "Ingesting…" : "Drag & drop images here"}
    </div>
  );
}
