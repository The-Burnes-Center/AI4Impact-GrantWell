import {
  SideNavigation,
  SideNavigationProps,
  Header,
  Button,
  Link,
  Box,
  StatusIndicator,
  SpaceBetween,
  ContentLayout,
  Container,
  Tabs,
  Alert,
} from "@cloudscape-design/components";
import { useContext, useState, useEffect } from "react";
import useOnFollow from "../common/hooks/use-on-follow";
import { useNavigationPanelState } from "../common/hooks/use-navigation-panel-state";
import { useNavigate } from "react-router-dom";
import { AppContext } from "../common/app-context";
import PencilSquareIcon from "../../public/images/pencil-square.jsx";
import RouterButton from "../components/wrappers/router-button";
import { ApiClient } from "../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import { SessionRefreshContext } from "../common/session-refresh-context";
import { useNotifications } from "../components/notif-manager";
import { Utils } from "../common/utils.js";
import DocumentsTab from "../pages/admin/documents-tab";
import DataFileUpload from "../pages/admin/file-upload-tab";
import { useSearchParams } from "react-router-dom";

export default function NavigationPanel({
  documentIdentifier,
  onClose,
}: {
  documentIdentifier: string;
  onClose: () => void;
}) {
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get("folder");
  const identifier = documentIdentifier || folderParam;
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const onFollow = useOnFollow();
  const [navigationPanelState, setNavigationPanelState] =
    useNavigationPanelState();
  const navigate = useNavigate();
  const [items, setItems] = useState<SideNavigationProps.Item[]>([]);
  const [loaded, setLoaded] = useState<boolean>(false);
  const { needsRefresh, setNeedsRefresh } = useContext(SessionRefreshContext);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const { addNotification, removeNotification } = useNotifications();
  const [activeHref, setActiveHref] = useState(window.location.pathname);
  const [activeTab, setActiveTab] = useState("file");
  const [lastSyncTime, setLastSyncTime] = useState("");
  const [showUnsyncedAlert, setShowUnsyncedAlert] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const linkUrl = `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(identifier)}`

  // Check if the current user is an admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const user = await Auth.currentAuthenticatedUser();
        const adminRole = user?.signInUserSession?.idToken?.payload['custom:role'];
        if (adminRole) {
          const role = JSON.parse(adminRole);
          setIsAdmin(role.includes("Admin"));
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
      }
    };
    
    checkAdminStatus();
  }, []);

  const loadSessions = async () => {
    let username;
    try {
      await Auth.currentAuthenticatedUser().then(
        (value) => (username = value.username)
      );
      if (username && needsRefresh) {
        const fetchedSessions = await apiClient.sessions.getSessions(
          username,
          documentIdentifier
        );
        await updateItems(fetchedSessions);
        if (!loaded) {
          setLoaded(true);
        }
        setNeedsRefresh(false);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
      setLoaded(true);
      addNotification(
        "error",
        "Could not load sessions:".concat(error.message)
      );
      addNotification("info", "Please refresh the page");
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [needsRefresh]);

  const onReloadClick = async () => {
    await loadSessions();
    const id = addNotification("success", "Sessions reloaded successfully!");
    Utils.delay(3000).then(() => removeNotification(id));
  };

  const updateItems = async (sessions) => {
    let newItems: SideNavigationProps.Item[] = [
      {
        type: "section",
        text: "Session History",
        items: sessions
          .map((session) => ({
            type: "link",
            text: session.title,
            href: `/chatbot/playground/${session.session_id}?folder=${session.document_identifier}`,
          }))
          .concat([
            {
              type: "link",
              info: (
                <Box margin="xxs" textAlign="center">
                  <RouterButton
                    href={`/chatbot/sessions?folder=${encodeURIComponent(
                      documentIdentifier || ""
                    )}`}
                    loading={loadingSessions}
                    variant="link"
                  >
                    View All Sessions
                  </RouterButton>
                  <Button
                    onClick={onReloadClick}
                    iconName="refresh"
                    loading={loadingSessions}
                    variant="link"
                  >
                    Reload Sessions
                  </Button>
                </Box>
              ),
            },
          ]),
      },
    ];
    setItems(newItems);
  };

  const onChange = ({
    detail,
  }: {
    detail: SideNavigationProps.ChangeDetail;
  }) => {
    const sectionIndex = items.indexOf(detail.item);
    setNavigationPanelState({
      collapsedSections: {
        ...navigationPanelState.collapsedSections,
        [sectionIndex]: !detail.expanded,
      },
    });
  };

  const refreshSyncTime = async () => {
    try {
      const lastSync = await apiClient.knowledgeManagement.lastKendraSync();
      setLastSyncTime(lastSync);
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box margin="xs" padding={{ top: "l" }} textAlign="center">
        <div
          style={{
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Button
            iconAlign="left"
            iconSvg={<PencilSquareIcon />}
            variant="primary"
            onClick={() =>
              navigate(
                `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(
                  identifier
                )}`
              )
            }
            className="new-chat-button"
            // style={{
            //   textAlign: "center",
            //   justifyContent: "center",
            //   display: "inline-flex",
            //   alignItems: "center",
            //   width: "250px"
            // }}
          >
            New Chatbot Session
          </Button>
        </div>
        <div
          style={{
            borderBottom: "1px solid #f4f4f4",
            padding: "8px 0",
            margin: "0 30px",
          }}
        ></div>
        <div
          style={{
            marginTop: "20px",
            margin: "0 10px",
            color: "#666871",
            fontSize: "13px",
          }}
        >
          Navigate to the GrantWell chatbot, which will help you craft your
          project narrative.
        </div>
        <div>
          <p style={{ fontSize: "13px", color: "#555", marginBottom: "0px" }}>
            For guidance prompting the chatbot, please navigate to the below
            <br />
            <a
              href="/images/Prompt Suggestions for Grantwell's Chatbot Users.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              Prompt Engineering Guide.
            </a>
            <br />
          </p>
        </div>
      </Box>
      <div style={{ position: "absolute", top: 5, right: 5 }}>
        <Button iconName="angle-left" variant="icon" onClick={onClose} />
      </div>
      <div
        style={{
          borderBottom: "1px solid #dedee2",
          padding: "8px 0",
          margin: "0 30px",
        }}
      >
        <Box />
      </div>

      <Box margin="xs" padding={{ top: "l" }} textAlign="center">
        <SpaceBetween size="s">
          <Box textAlign="right" margin={{ right: "l" }}>
            <h2
              style={{ fontSize: "24px", display: "inline", color: "#006499" }}
            >
              Key Requirements
            </h2>
          </Box>
          <Box textAlign="right" margin={{ right: "l" }}>
            <Link
              href={`/landing-page/basePage/checklists/${encodeURIComponent(
                identifier
              )}?folder=${encodeURIComponent(identifier)}#eligibility`}
            >
              <span style={{ color: "#006499" }}>Eligibility Criteria</span>
            </Link>
          </Box>
          <Box textAlign="right" margin={{ right: "l" }}>
            <Link
              href={`/landing-page/basePage/checklists/${encodeURIComponent(
                identifier
              )}?folder=${encodeURIComponent(identifier)}#narrative`}
            >
              <span style={{ color: "#006499" }}>
                Project Narrative Components
              </span>
            </Link>
          </Box>
          <Box textAlign="right" margin={{ right: "l" }}>
            <Link
              href={`/landing-page/basePage/checklists/${encodeURIComponent(
                identifier
              )}?folder=${encodeURIComponent(identifier)}#documents`}
            >
              <span style={{ color: "#006499" }}>Documents Required</span>
            </Link>
          </Box>
          <Box textAlign="right" margin={{ right: "l" }}>
            <Link
              href={`/landing-page/basePage/checklists/${encodeURIComponent(
                identifier
              )}?folder=${encodeURIComponent(identifier)}#deadlines`}
            >
              <span style={{ color: "#006499" }}>Key Deadlines</span>
            </Link>
          </Box>
        </SpaceBetween>
      </Box>
      <div
        style={{
          borderBottom: "1px solid #dedee2",
          padding: "8px 0",
          margin: "0 30px",
        }}
      >
        <Box />
      </div>

      <Box margin="xs" padding={{ top: "l" }} textAlign="center">
        <SpaceBetween size="xl">
          <Box textAlign="right" margin={{ right: "l" }}>
            <h2
              style={{ fontSize: "24px", display: "inline", color: "#0073bb" }}
            >
              File Upload
            </h2>
          </Box>
        </SpaceBetween>
      </Box>
      <Box margin={{ horizontal: "l" }}>
        <SpaceBetween size="l">
          <DataFileUpload 
            tabChangeFunction={() => setActiveTab("file")}
          />
          {isAdmin && (
            <Button
              variant="link"
              iconName={activeTab === "backend-controls" ? "caret-down" : "caret-up"}
              onClick={() => setActiveTab(activeTab === "backend-controls" ? "" : "backend-controls")}
            >
              Manage Backend Files
            </Button>
          )}
          {isAdmin && activeTab === "backend-controls" && (
            <DocumentsTab
              tabChangeFunction={() => setActiveTab("add-data")}
              documentType="file"
              statusRefreshFunction={refreshSyncTime}
              lastSyncTime={lastSyncTime}
              setShowUnsyncedAlert={setShowUnsyncedAlert}
            />
          )}
        </SpaceBetween>
      </Box>
      <div
        style={{
          borderBottom: "1px solid #dedee2",
          padding: "8px 0",
          margin: "0 30px",
        }}
      >
        <Box />
      </div>

      <Box margin="xs" padding={{ top: "l" }} textAlign="center">
        <SpaceBetween size="xl">
          <Box textAlign="right" margin={{ right: "l" }}>
            <h2
              style={{ fontSize: "24px", display: "inline", color: "#0073bb" }}
            >
              Session History
            </h2>
          </Box>
        </SpaceBetween>
      </Box>
      <div style={{ flex: 1, minHeight: 0 }}>
        {loaded ? (
          <Box margin={{ horizontal: "l" }}>
            <SpaceBetween size="m">
              {items
                .find(
                  (section): section is SideNavigationProps.Section =>
                    "text" in section && section.text === "Session History"
                )
                ?.items.filter(
                  (item): item is SideNavigationProps.Link =>
                    item.type === "link" && "text" in item
                )
                .map((session) => (
                  <Box
                    textAlign="right"
                    margin={{ right: "l" }}
                    key={session.href}
                  >
                    <Link href={session.href}>
                      <span style={{ color: "#0073bb" }}>{session.text}</span>
                    </Link>
                  </Box>
                ))}
              <Box textAlign="right" margin={{ right: "l" }}>
                <SpaceBetween size="xs" direction="horizontal">
                  <Button
                    onClick={() =>
                      navigate(
                        `/chatbot/sessions?folder=${encodeURIComponent(
                          documentIdentifier || ""
                        )}`
                      )
                    }
                    loading={loadingSessions}
                    variant="link"
                  >
                    View All Sessions
                  </Button>
                  <Box margin={{ bottom: "s" }}>
                    <Button
                      onClick={onReloadClick}
                      iconName="refresh"
                      loading={loadingSessions}
                      variant="link"
                    >
                      Reload Sessions
                    </Button>
                  </Box>
                </SpaceBetween>
              </Box>
            </SpaceBetween>
          </Box>
        ) : (
          <Box textAlign="center">
            <StatusIndicator type="loading">
              Loading sessions...
            </StatusIndicator>
          </Box>
        )}
      </div>
    </div>
  );
}
