import React from "react";

interface RecentNOFO {
  label: string;
  value: string;
  lastViewed: string;
}

interface HistoryPanelProps {
  recentlyViewedNOFOs: RecentNOFO[];
  onSelect: (href: string, nofo: RecentNOFO) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({
  recentlyViewedNOFOs,
  onSelect,
}) => (
  <div className="history-panel">
    <h2 className="history-panel__heading">
      Recently viewed funding calls (NOFOs)
    </h2>
    {recentlyViewedNOFOs.length > 0 ? (
      recentlyViewedNOFOs.slice(0, 6).map((nofo, index) => (
        <button
          key={index}
          className="history-card"
          onClick={() =>
            onSelect(
              `/requirements/${encodeURIComponent(nofo.value)}`,
              nofo
            )
          }
          aria-label={`View ${nofo.label}`}
        >
          <span className="history-card__name">{nofo.label}</span>
          <div className="history-card__date">
            <span>Last viewed: {nofo.lastViewed}</span>
          </div>
        </button>
      ))
    ) : (
      <p className="history-panel__empty">
        You haven&apos;t viewed any NOFOs recently.
      </p>
    )}
  </div>
);

export default HistoryPanel;
