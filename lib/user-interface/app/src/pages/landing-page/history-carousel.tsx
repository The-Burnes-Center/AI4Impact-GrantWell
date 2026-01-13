import React, { useState } from "react";

interface NOFO {
  id: string;
  title: string;
}

interface HistoryCarouselProps {
  onNOFOSelect: (href: string) => void;
}

const HistoryCarousel: React.FC<HistoryCarouselProps> = ({ onNOFOSelect }) => {
  const [nofos] = useState<NOFO[]>([
    { id: "1", title: "Grid Resilience and Innovative Partnerships" },
    {
      id: "2",
      title: "Charging and Fueling Infrastructure Discretionary Grant NOFO",
    },
    { id: "3", title: "Clean School Bus NOFO" },
  ]);

  // Track which button is being hovered
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Styles
  const carouselStyles = {
    padding: "16px 8px",
    marginBottom: "24px",
  };

  const buttonStyles = {
    background: "none",
    border: "none",
    color: "#14558F",
    padding: "8px 12px",
    fontSize: "14px",
    textAlign: "left" as const,
    cursor: "pointer",
    borderRadius: "4px",
    width: "100%",
    fontWeight: 500,
    transition: "all 0.2s ease",
  };

  const buttonHoverStyles = {
    ...buttonStyles,
    backgroundColor: "#f2f8fd",
    textDecoration: "underline",
  };

  const listStyles = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  };

  return (
    <div style={carouselStyles}>
      <div style={listStyles}>
        {nofos.map((nofo) => (
          <button
            key={nofo.id}
            style={hoveredId === nofo.id ? buttonHoverStyles : buttonStyles}
            onClick={() =>
              onNOFOSelect(`/landing-page/basePage/requirements/${nofo.id}`)
            }
            onMouseEnter={() => setHoveredId(nofo.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {nofo.title}
          </button>
        ))}
      </div>
    </div>
  );
};

export default HistoryCarousel;
