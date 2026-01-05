import { useState, useRef } from "react";
import "../styles/newspaper.css";
import "./DiscountInputView.css";

type InputSource = "text" | "xlsx" | "image" | null;

export default function DiscountInputView() {
  const [inputMode, setInputMode] = useState<"excel" | "text">("text");
  const [textInput, setTextInput] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [xlsxPath, setXlsxPath] = useState<string | null>(null);
  const [inputSource, setInputSource] = useState<InputSource>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

const handleFiles = async (fileList: FileList | null) => {
  if (!fileList || fileList.length === 0) return;

  const file = fileList[0];
  const name = file.name.toLowerCase();
  const type = file.type;

  setFiles([file.name]);
  setTextInput("");

  // ---------- IMAGE ----------
  if (type.startsWith("image/")) {
    setInputSource("image");
    setXlsxPath(null);
    setTextInput("[Image file detected — backend processing]");
    return;
  }

  // ---------- EXCEL ----------
  // ❗ XLSX is NOT allowed via drag/drop or browser picker
  if (name.endsWith(".xlsx")) {
    setInputSource("xlsx");
    setXlsxPath(null);

    // UI hint only — real selection must come from dialog
    setFiles([file.name]);
    setTextInput("");

    return;
  }

  // ---------- TEXT ----------
  const text = await file.text();
  setInputSource("text");
  setXlsxPath(null);
  setTextInput(text.trim());
};


const submit = async () => {
  // 🔒 HARD SYNC: decide source at submit time
  const effectiveSource: InputSource =
    xlsxPath ? "xlsx" : textInput.trim() ? "text" : null;

  if (!effectiveSource) {
    throw new Error("No valid discount input to submit");
  }

  setBusy(true);

  try {

    // ---------- XLSX ----------
    if (effectiveSource === "xlsx") {
      if (typeof xlsxPath !== "string" || !xlsxPath.trim()) {
        throw new Error("XLSX selected but file path is empty");
      }

      const items = await window.ufm.parseDiscountXlsx(xlsxPath);

      if (!items.length) {
        throw new Error("No valid discount items detected from XLSX");
      }

      await window.ufm.exportDiscountImages(items);
      return;
    }


    // ---------- TEXT ----------
    if (effectiveSource === "text") {
      const rawText = textInput;

      if (!rawText || !rawText.trim()) {
        throw new Error("Discount input is empty — abort parse");
      }

      console.log(
        "🧪 RAW DISCOUNT INPUT >>>",
        JSON.stringify(rawText),
        typeof rawText
      );

      const items = await window.ufm.parseDiscountText(rawText);

      console.log("UI received parsed items:", items.length);

      await window.ufm.exportDiscountImages(items);
    }
  } finally {
    setBusy(false);
  }
};

function handleSelectedFile(file: File) {
  setFiles([file.name]);

  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "xlsx") {
    setInputSource("xlsx");

    // 🔑 Electron-only: absolute file path
    // This is what parseDiscountXlsx MUST receive
    const path = (file as any).path;

    if (typeof path !== "string" || !path.trim()) {
      throw new Error("Selected XLSX file has no valid path");
    }

    setXlsxPath(path);
    return;
  }

  if (ext === "txt" || ext === "csv" || ext === "tsv") {
    setInputSource("text");
    // your existing text handling logic stays
    return;
  }

  if (file.type.startsWith("image/")) {
    setInputSource("image");
    // your existing image logic stays
    return;
  }
}

  return (
    <div style={{ marginTop: 40 }}>
      <h2 className="discount-title">Discount Input</h2>

      <div className="card">
        {/* FILE INPUT */}
 
        <div className="section">
          <div
              className="file-drop"
              onClick={async () => {
                if (busy) return;

                // XLSX → Electron dialog (path-based)
                if (inputSource === "xlsx") {
                  const path = await window.ufm.openXlsxDialog();
                  if (!path) return;

                  setInputSource("xlsx");
                  setXlsxPath(path);
                  setFiles([path.split("/").pop() || "file.xlsx"]);
                  return;
                }

                // everything else → browser picker
                fileInputRef.current?.click();
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (busy) return;

                const files = e.dataTransfer.files;
                if (!files || !files.length) return;

                handleFiles(files);
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
                  <span className="hint">Click Generate to continue</span>
                </>
              )}
            </div>



          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".txt,.csv,.tsv,.xlsx,image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              handleSelectedFile(file);
            }}
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
        <div
          style={{
            marginBottom: 8,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5
          }}
        >
          {inputMode === "excel" ? "🟦 Excel table detected" : "🟨 Free text detected"}
        </div>

        {/* TEXT INPUT */}
        <div className="section">
          <textarea
            className="text-input"
            value={textInput}
            disabled={inputSource === "xlsx" || busy}
            onChange={e => {
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
