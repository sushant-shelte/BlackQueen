import React, { useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';

const toneLabels = {
  positive: 'is-positive',
  neutral: 'is-neutral',
  warning: 'is-warning',
  negative: 'is-negative'
} as const;

export const ActionFeedPanel: React.FC = () => {
  const { activityFeed } = useGame();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const recentEntries = useMemo(() => activityFeed?.slice(0, 8) ?? [], [activityFeed]);

  const handleToggleCollapse = () => {
    setIsCollapsed((current) => !current);
  };

  return (
    <aside className={`feed-panel game-panel ${isCollapsed ? 'is-collapsed' : ''}`}>
      <div className="feed-panel__header">
        <div>
          <h3>Action Feed</h3>
          <p className="status-line">Live game updates</p>
        </div>
        <div className="feed-panel__actions">
          <span className="feed-panel__badge">{recentEntries.length}</span>
          <button
            className="button button--icon"
            onClick={handleToggleCollapse}
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand action feed' : 'Collapse action feed'}
            title={isCollapsed ? 'Expand action feed' : 'Collapse action feed'}
          >
            {isCollapsed ? (
              <span className="icon">▶</span>
            ) : (
              <span className="icon">◀</span>
            )}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="feed-panel__list">
          {recentEntries.length > 0 ? recentEntries.map((entry) => (
            <article key={entry.id} className={`feed-item ${toneLabels[entry.tone]}`}>
              <div className="feed-item__meta">
                <strong>{entry.title}</strong>
                <time>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </div>
              <p>{entry.detail}</p>
            </article>
          )) : (
            <div className="feed-item feed-item--empty">
              <strong>Nothing yet.</strong>
              <p>Room events will appear here as the game unfolds.</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
