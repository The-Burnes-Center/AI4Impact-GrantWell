import React from "react";

interface TableScrollRegionProps {
  label: string;
  minWidth?: number;
  className?: string;
  children: React.ReactNode;
}

const TableScrollRegion = React.memo(function TableScrollRegion({
  label,
  minWidth,
  className = "table-scroll",
  children,
}: TableScrollRegionProps) {
  return (
    <div
      className={className}
      role="region"
      aria-label={`${label}, scroll horizontally to see all columns`}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region needs keyboard access (WCAG 2.1.1)
      tabIndex={0}
      style={
        minWidth === undefined
          ? undefined
          : ({ "--gw-table-min-width": `${minWidth}px` } as React.CSSProperties)
      }
    >
      {children}
    </div>
  );
});

export default TableScrollRegion;
