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
  Alert
} from "@cloudscape-design/components";
import { useContext, useState, useEffect } from "react";
import useOnFollow from "../common/hooks/use-on-follow";
import { useNavigationPanelState } from "../common/hooks/use-navigation-panel-state";
import { useNavigate } from 'react-router-dom';
import { AppContext } from "../common/app-context";
import PencilSquareIcon from "../../public/images/pencil-square.jsx";
import RouterButton from "../components/wrappers/router-button";
import { ApiClient } from "../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { v4 as uuidv4 } from "uuid";
import { SessionRefreshContext } from "../common/session-refresh-context";
import { useNotifications } from "../components/notif-manager";
import { Utils } from "../common/utils.js";
import BackArrowIcon from "../../public/images/back-arrow.jsx";
import DocumentsTab from "../pages/admin/documents-tab";
import DataFileUpload from "../pages/admin/file-upload-tab";

export default function NavigationPanel({ documentIdentifier }) {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const onFollow = useOnFollow();
  const [navigationPanelState, setNavigationPanelState] = useNavigationPanelState();
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
  const linkUrl = `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(documentIdentifier)}`

  const loadSessions = async () => {
    let username;
    try {
      await Auth.currentAuthenticatedUser().then((value) => username = value.username);
      if (username && needsRefresh) {
        const fetchedSessions = await apiClient.sessions.getSessions(username, documentIdentifier);
        await updateItems(fetchedSessions);
        if (!loaded) {
          setLoaded(true);
        }
        setNeedsRefresh(false);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
      setLoaded(true);
      addNotification("error", "Could not load sessions:".concat(error.message));
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
    const newItems: SideNavigationProps.Item[] = [
      
      {
        type: "section",
        text: "Session History",
        items: sessions.map(session => ({
          type: "link",
          text: session.title,
          href: `/chatbot/playground/${session.session_id}`,
        })).concat([{
          type: "link",
          info: (
            <Box margin="xxs" textAlign="center">
              <RouterButton href={`/chatbot/sessions?folder=${encodeURIComponent(documentIdentifier || '')}`} loading={loadingSessions} variant="link">View All Sessions</RouterButton>
              <Button onClick={onReloadClick} iconName="refresh" loading={loadingSessions} variant="link">Reload Sessions</Button>
            </Box>
          ),
        }]),
      },
      {
        type: "section",
        text: "Resources",
        items: [
          // Upload functionality disabled
          // {
          //   type: "link",
          //   //text: "Current Files",
          //   href: "#",
          //   info: (
          //     <DocumentsTab
          //       tabChangeFunction={() => setActiveTab("add-data")}
          //       documentType="file"
          //       statusRefreshFunction={refreshSyncTime}
          //       lastSyncTime={lastSyncTime}
          //       setShowUnsyncedAlert={setShowUnsyncedAlert}
          //     />
          //   ),
          // },
          // {
          //   type: "link",
          //   text: "Add Files",
          //   href: "#",
          //   info: (
          //     <DataFileUpload 
          //       tabChangeFunction={() => setActiveTab("file")}
          //     />
          //   ),
          // },
          {
            type: "link",
            text: "Prompt Engineering Guide",
            href: "/images/Prompt Suggestions for Grantwell's Chatbot Users.pdf",
            external: true
          },
          { 
            type: "link", 
            text: "Provide Feedback", 
            href: "https://forms.gle/jNHk8usCSNBzhL998", 
            external: true 
          },
        ]
      }
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
      <Box margin="xs" padding={{ top: "l" }} textAlign="center">
      <SpaceBetween size="xl">
        {/* <Button 
          onClick={() => navigate(`/landing-page/basePage/checklists/${encodeURIComponent(documentIdentifier)}`)}
          variant="primary"
          aria-label="Return to Home Page"
          iconSvg={<BackArrowIcon />}
        >
          Back to requirements
        </Button> */}

        <RouterButton
          iconAlign="right"
          iconSvg={<PencilSquareIcon />}
          variant="primary"
          //href={`/chatbot/playground/${uuidv4()}`}
          href={`/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(documentIdentifier)}`}
          data-alignment="right"
          className="new-chat-button"
          style={{ textAlign: "right" }}
        >
          Start new chat session
        </RouterButton>
        <Box textAlign="right" margin={{ right: "s"}}>
          <Link href={linkUrl}>
            <h2 style={{ fontSize: '24px', display: 'inline', color: '#0073bb' }}>Click Here to Start a Narrative For This Grant</h2>
          </Link>
        </Box>
        </SpaceBetween>
      </Box>

        {loaded ? (
          <SideNavigation
            activeHref={activeHref}
            onFollow={event => {
              if (!event.detail.external) {
                event.preventDefault();
                setActiveHref(event.detail.href);
                onFollow(event);
              }
            }}
            onChange={onChange}
            items={items}
          />
        ) : (
          <Box textAlign="center">
            <StatusIndicator type="loading">Loading sessions...</StatusIndicator>
          </Box>
        )}
      </div>
    </div>
  );
} 