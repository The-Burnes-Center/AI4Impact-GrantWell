import { ReactElement, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Container, Row, Col, Offcanvas } from "react-bootstrap";
import { SessionRefreshContext } from "../common/session-refresh-context";
import { NotificationProvider } from "../components/notifications/NotificationManager";
import NotificationBar from "../components/notifications/NotificationBar";
import "bootstrap/dist/css/bootstrap.min.css";

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
          {/* Main content area */}
          <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
            <Container fluid className="p-0">
              {breadcrumbs && (
                <div className="p-3 border-bottom">
                  {breadcrumbs}
                </div>
              )}
              <Row className="g-0">
                <Col style={{ flex: 1 }}>
                  <NotificationBar />
                  {content}
                </Col>
                {splitPanel && (
                  <Col xs="auto" style={{ width: toolsWidth || 400, borderLeft: "1px solid #dee2e6" }}>
                    <div className="p-3 h-100" style={{ overflowY: "auto" }}>
                      {splitPanel}
                    </div>
                  </Col>
                )}
              </Row>
              {info && (
                <Offcanvas
                  show={toolsOpen}
                  onHide={() => setToolsOpen(false)}
                  placement="end"
                  style={{ width: toolsWidth || 400 }}
                >
                  <Offcanvas.Header closeButton>
                    <Offcanvas.Title>Tools</Offcanvas.Title>
                  </Offcanvas.Header>
                  <Offcanvas.Body>
                    {info}
                  </Offcanvas.Body>
                </Offcanvas>
              )}
            </Container>
          </div>
        </div>
      </NotificationProvider>
    </SessionRefreshContext.Provider>
  );
}
