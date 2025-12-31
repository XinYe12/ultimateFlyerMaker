import ImageDropArea from "./components/ImageDropArea";
import CutoutPreview from "./components/CutoutPreview";
import OcrResult from "./components/OcrResult";
import DbMatches from "./components/DbMathches";
import WebMatches from "./components/WebMatches";
import { IngestItem } from "./types";

export default function IngestResultView({ item }: { item: IngestItem }) {
  if (item.status === "error") {
    return <pre style={{ color: "#a00" }}>{item.error}</pre>;
  }

  if (item.status !== "done" || !item.result) return null;

 return (
    <>
        {item.result?.cutoutPath && (
        <CutoutPreview cutoutPath={item.result.cutoutPath} />
        )}

        {item.result?.ocr && (
        <OcrResult ocr={item.result.ocr} />
        )}

        <DbMatches matches={item.result?.dbMatches} />

        <WebMatches matches={item.result?.webMatches} />
    </>
    );

}
