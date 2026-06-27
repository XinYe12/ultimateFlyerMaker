import React, { useEffect, useMemo, useRef } from 'react';
import type { HistoryEntry } from './editorHistory';

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function entryAffectsDepartment(entry: HistoryEntry, department: string): boolean {
  return entry.departments.includes('*') || entry.departments.includes(department);
}

interface Props {
  entries: HistoryEntry[];
  currentIndex: number;
  activeDepartment: string;
  onJumpTo: (index: number) => void;
  onClose: () => void;
  embedded?: boolean;
}

export default function HistoryStackPanel({
  entries,
  currentIndex,
  activeDepartment,
  onJumpTo,
  onClose,
  embedded,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    return entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entryAffectsDepartment(entry, activeDepartment));
  }, [entries, activeDepartment]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex, filtered.length]);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#fff',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid #dde1e7',
      boxSizing: 'border-box',
    }}>
      {!embedded && (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px 8px',
        borderBottom: '1px solid #eaecef',
        flexShrink: 0,
      }}>
        <span style={{
          fontWeight: 700, fontSize: 12, color: '#374151',
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>
          History
        </span>
        <button
          onClick={onClose}
          title="Close"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#9ca3af', fontSize: 18, lineHeight: 1, padding: '0 2px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>
      )}

      <div style={{ padding: '5px 12px 4px', fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>
        Click a state to jump back or forward
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 8px' }}>
        {filtered.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center', padding: '24px 12px' }}>
            No history yet
          </div>
        ) : (
          filtered.map(({ entry, index }) => {
            const isCurrent = index === currentIndex;
            const isFuture = index > currentIndex;
            return (
              <button
                key={entry.id}
                ref={isCurrent ? activeRef : undefined}
                onClick={() => onJumpTo(index)}
                style={{
                  width: '100%',
                  display: 'block',
                  textAlign: 'left',
                  padding: '8px 10px',
                  marginBottom: 4,
                  border: isCurrent ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                  borderRadius: 6,
                  background: isCurrent ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                  opacity: isFuture ? 0.45 : 1,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{
                  fontSize: 12,
                  fontWeight: isCurrent ? 600 : 500,
                  color: isFuture ? '#9ca3af' : '#374151',
                  lineHeight: 1.3,
                  marginBottom: 2,
                }}>
                  {entry.label}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>
                  {formatRelativeTime(entry.timestamp)}
                  {isFuture && ' · redo path'}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
