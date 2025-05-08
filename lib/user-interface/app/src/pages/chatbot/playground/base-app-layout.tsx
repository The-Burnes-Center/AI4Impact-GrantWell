import React from "react";

interface BaseAppLayoutProps {
  header: React.ReactNode;
  content: React.ReactNode;
  info?: React.ReactNode;
  toolsOpenExternal?: boolean;
  onToolsOpenChange?: (isOpen: boolean) => void;
  documentIdentifier?: string;
  toolsWidth?: number;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
  },
  mainContainer: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  contentArea: {
    flex: 1,
    overflow: "auto",
    height: "100%",
  },
  toolsPanel: {
    height: "100%",
    overflow: "hidden",
    borderLeft: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
  },
};

export default function BaseAppLayout({
  header,
  content,
  info,
  toolsOpenExternal = false,
  onToolsOpenChange,
  documentIdentifier,
  toolsWidth = 300,
}: BaseAppLayoutProps) {
  // Toggle tools panel
  const handleToolsToggle = () => {
    if (onToolsOpenChange) {
      onToolsOpenChange(!toolsOpenExternal);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header area */}
      {header}

      {/* Main content area */}
      <div style={styles.mainContainer}>
        {/* Primary content */}
        <div style={styles.contentArea}>{content}</div>

        {/* Tools/help panel - conditionally rendered based on toolsOpenExternal */}
        {toolsOpenExternal && info && (
          <div
            style={{
              ...styles.toolsPanel,
              width: toolsWidth,
            }}
          >
            {info}
          </div>
        )}
      </div>
    </div>
  );
}
