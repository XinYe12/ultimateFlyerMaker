import React from 'react';
import ProjectImagePanel, { PanelImageItem } from './ProjectImagePanel';
import HistoryStackPanel from './HistoryStackPanel';
import type { HistoryEntry } from './editorHistory';

export type LeftPanelTab = 'images' | 'history';

interface Props {
  tab: LeftPanelTab;
  onTabChange: (tab: LeftPanelTab) => void;
  onClose: () => void;
  activeDepartment: string;
  imageItems: PanelImageItem[];
  historyEntries: HistoryEntry[];
  historyCurrentIndex: number;
  onHistoryJumpTo: (index: number) => void;
}

export default function EditorLeftPanel({
  tab,
  onTabChange,
  onClose,
  activeDepartment,
  imageItems,
  historyEntries,
  historyCurrentIndex,
  onHistoryJumpTo,
}: Props) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: '#fff',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #eaecef',
        flexShrink: 0,
        padding: '6px 8px 0',
        gap: 2,
      }}>
        {(['images', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            style={{
              flex: 1,
              padding: '6px 4px',
              border: 'none',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? '#2563eb' : '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {t === 'images' ? 'Images' : 'History'}
          </button>
        ))}
        <button
          onClick={onClose}
          title="Close panel"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#9ca3af', fontSize: 16, lineHeight: 1, padding: '0 4px 6px',
            marginLeft: 2,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'images' ? (
          <ProjectImagePanel
            items={imageItems}
            activeDepartment={activeDepartment}
            onClose={onClose}
            embedded
          />
        ) : (
          <HistoryStackPanel
            entries={historyEntries}
            currentIndex={historyCurrentIndex}
            activeDepartment={activeDepartment}
            onJumpTo={onHistoryJumpTo}
            onClose={onClose}
            embedded
          />
        )}
      </div>
    </div>
  );
}
