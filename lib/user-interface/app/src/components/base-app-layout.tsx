import { AppLayout, Button } from "@cloudscape-design/components";
import { ReactElement, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SessionRefreshContext } from "../common/session-refresh-context";
import { NotificationProvider } from "./notif-manager";
import NotificationBar from "./notif-flashbar";
import NavigationPanel from "./navigation-panel";

interface BaseAppLayoutProps {
  content: ReactElement;
  info?: ReactElement;
  documentIdentifier?: string;
  contentType?: "default" | "cards" | "table" | "form";
  breadcrumbs?: ReactElement;
  splitPanel?: ReactElement;
  toolsWidth?: number;
}

export default function BaseAppLayout({
  content,
  info,
  documentIdentifier,
  contentType,
  breadcrumbs,
  splitPanel,
  toolsWidth,
}: BaseAppLayoutProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(true);
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get("folder");
  const [navOpen, setNavOpen] = useState(false);
  return (
    <SessionRefreshContext.Provider value={{ needsRefresh, setNeedsRefresh }}>
      <NotificationProvider>
        <div style={{ display: "flex", height: "100vh" }}>
          {/* Static left panel */}
          {!navOpen && (
            <div
              style={{
                position: "fixed", // use fixed to avoid layout constraints
                top: 60,
                left: 10,
                zIndex: 9999,
                padding: 4,
                backgroundColor: "#fff",
                borderRadius: "4px",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                display: "inline-block",
              }}
            >
              <Button
                iconName="angle-right"
                variant="icon"
                ariaLabel="Open navigation"
                onClick={() => setNavOpen(true)}
              />
            </div>
          )}
          {/* Sidebar */}
          <div style={{ display: "flex", height: "100%" }}>
            {navOpen && (
              <div
                style={{
                  width: "300px",
                  backgroundColor: "#f4f4f4",
                  borderRight: "1px solid #eaeded",
                  overflow: "auto",
                  position: "relative",
                }}
              >
                <NavigationPanel
                  documentIdentifier={documentIdentifier || folderParam}
                  onClose={() => setNavOpen(false)}
                />
              </div>
            )}

            {/* Main content and tools area using AppLayout */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <AppLayout
                headerSelector="#awsui-top-navigation"
                content={
                  <>
                    <NotificationBar />
                    {content}
                  </>
                }
                toolsHide={!info}
                tools={info}
                toolsOpen={toolsOpen}
                onToolsChange={({ detail }) => setToolsOpen(detail.open)}
                contentType={contentType}
                navigationHide={true}
                toolsWidth={toolsWidth}
              />
            </div>
          </div>
        </div>
      </NotificationProvider>
    </SessionRefreshContext.Provider>
  );
}
