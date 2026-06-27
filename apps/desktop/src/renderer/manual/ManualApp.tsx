import { useCallback, useEffect, useState, type ReactNode } from "react";
import Button from "../components/ui/Button";
import ManualDiagram from "./diagrams";
import {
  MANUAL_CHAPTERS,
  type DiagramKey,
  initialChapterFromHash,
} from "./manualContent";
import "./manual.css";

function renderInlineMarkdown(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function ManualApp() {
  const [chapterIdx, setChapterIdx] = useState(() => {
    const id = initialChapterFromHash();
    return MANUAL_CHAPTERS.findIndex((ch) => ch.id === id);
  });

  const chapter = MANUAL_CHAPTERS[chapterIdx] ?? MANUAL_CHAPTERS[0];

  const goTo = useCallback((idx: number) => {
    const next = Math.max(0, Math.min(MANUAL_CHAPTERS.length - 1, idx));
    setChapterIdx(next);
    const id = MANUAL_CHAPTERS[next].id;
    window.location.hash = id;
  }, []);

  useEffect(() => {
    const onHash = () => {
      const id = initialChapterFromHash();
      const idx = MANUAL_CHAPTERS.findIndex((ch) => ch.id === id);
      if (idx >= 0) setChapterIdx(idx);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="manual-root">
      <header className="manual-header">
        <div>
          <div className="manual-header-title">Ultimate Flyer Maker</div>
          <div className="manual-header-sub">Operator User Manual</div>
        </div>
      </header>

      <div className="manual-body">
        <nav className="manual-sidebar" aria-label="Chapters">
          <div className="manual-sidebar-label">Chapters</div>
          {MANUAL_CHAPTERS.map((ch, idx) => {
            const isActive = idx === chapterIdx;
            const isDone = idx < chapterIdx;
            return (
              <button
                key={ch.id}
                type="button"
                className={`manual-chapter-btn${isActive ? " manual-chapter-btn--active" : ""}`}
                onClick={() => goTo(idx)}
              >
                <span className="manual-chapter-dot" data-done={isDone} data-active={isActive}>
                  {isDone ? "✓" : idx + 1}
                </span>
                <span className="manual-chapter-label">{ch.title}</span>
              </button>
            );
          })}
        </nav>

        <main className="manual-main">
          <div className="manual-step-badge">
            Step {chapterIdx + 1} of {MANUAL_CHAPTERS.length}
          </div>
          <h1 className="manual-title">{chapter.title}</h1>
          <p className="manual-summary">{chapter.summary}</p>

          <div className="manual-diagram-wrap">
            <ManualDiagram diagram={chapter.diagram as DiagramKey} />
          </div>

          <ol className="manual-steps">
            {chapter.steps.map((step, i) => (
              <li key={i}>{renderInlineMarkdown(step)}</li>
            ))}
          </ol>

          {chapter.tip && (
            <div className="manual-callout manual-callout--tip">
              <strong>Tip:</strong> {chapter.tip}
            </div>
          )}
          {chapter.warning && (
            <div className="manual-callout manual-callout--warning">
              <strong>Note:</strong> {chapter.warning}
            </div>
          )}
        </main>
      </div>

      <footer className="manual-footer">
        <Button
          variant="secondary"
          size="sm"
          disabled={chapterIdx === 0}
          onClick={() => goTo(chapterIdx - 1)}
        >
          ← Previous
        </Button>
        <span className="manual-footer-progress">
          {chapterIdx + 1} / {MANUAL_CHAPTERS.length}
        </span>
        <Button
          variant="primary"
          size="sm"
          disabled={chapterIdx === MANUAL_CHAPTERS.length - 1}
          onClick={() => goTo(chapterIdx + 1)}
        >
          Next →
        </Button>
      </footer>
    </div>
  );
}
