import { useState, useRef, useEffect } from "react";
import "../styles/newspaper.css";
import "./DiscountInputView.css";

type InputSource = "text" | "xlsx" | "image" | null;

type Props = {
  onAuthoritativeTitle: (title: string) => void;
  onDiscountsParsed: () => void;
};

export default function DiscountInputView({
  onAuthoritativeTitle,
  onDiscountsParsed,
}: Props) {
  const [inputMode, setInputMode] = useState<"excel" | "text">("text");
  const [textInput, setTextInput] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [xlsxPath, setXlsxPath] = useState<string | null>(null);
  const [inputSource, setInputSource] = useState<InputSource>(null);

  const [parsedItems, setParsedItems] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- EXPORT FROM STATE ONLY ---------- */
  useEffect(() => {
    if (parsedItems.length === 0) return;
    window.ufm.exportDiscountImages(parsedItems);
  }, [parsedItems]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const file = fileList[0];
    const name = file.name.toLowerCase();
    const type = file.type;

    setFiles([file.name]);
    setTextInput("");

    if (type.startsWith("image/")) {
      setInputSource("image");
      setXlsxPath(null);
      setTextInput("[Image file detected — backend processing]");
      return;
    }

    if (name.endsWith(".xlsx")) {
      setInputSource("xlsx");
      const path = (file as any).path;
      if (!path) throw new Error("XLSX has no path");
      setXlsxPath(path);
      return;
    }

    const text = await file.text();
    setInputSource("text");
    setXlsxPath(null);
    setTextInput(text.trim());
  };

  const submit = async () => {
    const effectiveSource: InputSource =
      xlsxPath ? "xlsx" : textInput.trim() ? "text" : null;

    if (!effectiveSource) {
      throw new Error("No valid discount input to submit");
    }

    setBusy(true);

    try {
      let items: any[] = [];

      if (effectiveSource === "xlsx") {
        if (!xlsxPath) throw new Error("XLSX path missing");
        items = await window.ufm.parseDiscountXlsx(xlsxPath);
      }

      if (effectiveSource === "text") {
        items = await window.ufm.parseDiscountText(textInput);
      }

      setParsedItems(items);

      const title = items?.[0]?.title;
      if (title) onAuthoritativeTitle(title);

      onDiscountsParsed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 40 }}>
      <h2 className="discount-title">Discount Input</h2>

      <div className="card">
        <div className="section">
          <div
            className="file-drop"
            onClick={() => {
              if (busy) return;
              fileInputRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (busy) return;
              handleFiles(e.dataTransfer.files);
            }}
          >
            {files.length === 0 ? (
              <>
                Drop files or click to upload
                <span className="hint">TXT · CSV · Excel · Image</span>
              </>
            ) : (
              <>
                File selected
                <span className="hint">Click Submit to continue</span>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".txt,.csv,.tsv,.xlsx,image/*"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {files.length > 0 && (
            <div className="file-list">
              {files.join(", ")}
              {inputSource && (
                <span className="badge">{inputSource.toUpperCase()}</span>
              )}
            </div>
          )}
        </div>

        <div className="divider" />

        <div className="section">
          <textarea
            className="text-input"
            value={textInput}
            disabled={inputSource === "xlsx" || busy}
            onChange={(e) => {
              const value = e.target.value;
              setTextInput(value);
              setInputMode(value.includes("\t") ? "excel" : "text");
              setInputSource("text");
              setFiles([]);
              setXlsxPath(null);
            }}
            placeholder="Paste discount lines here"
          />

          <button
            className={`card__button ${busy ? "glitch" : ""}`}
            disabled={!inputSource || busy}
            onClick={submit}
          >
            {busy ? "Processing…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
