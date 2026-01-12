import { AppLayout } from "@cloudscape-design/components";
import { ReactElement, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SessionRefreshContext } from "../common/session-refresh-context";
import { NotificationProvider } from "./notif-manager";
import NotificationBar from "./notif-flashbar";

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

  return (
    <SessionRefreshContext.Provider value={{ needsRefresh, setNeedsRefresh }}>
      <NotificationProvider>
        <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
          {/* Main content and tools area using AppLayout */}
          <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
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
      </NotificationProvider>
    </SessionRefreshContext.Provider>
  );
}
