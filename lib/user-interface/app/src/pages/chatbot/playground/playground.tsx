import React, { useState, useEffect, useContext } from "react";
import BaseAppLayout from "./base-app-layout";
import Chat from "../../../components/chatbot/chat";
import {
  Link,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { FileText, HelpCircle, CheckSquare } from "lucide-react";
import { ApiClient } from "../../../common/api-client/api-client";
import { AppContext } from "../../../common/app-context";

// Styles for components
const styles: Record<string, React.CSSProperties> = {
  headerContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid #e5e7eb",
  },
  headerTitle: {
    fontSize: "28px",
    fontWeight: "700",
    color: "#111827",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "60%",
  },
  headerActions: {
    display: "flex",
    gap: "12px",
  },
  actionButton: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: "500",
  },
  primaryButton: {
    backgroundColor: "#1a73e8",
    color: "white",
  },
  secondaryButton: {
    backgroundColor: "#f3f4f6",
    color: "#4b5563",
  },
  accentButton: {
    backgroundColor: "#0aa5ff",
    color: "white",
  },
  helpPanel: {
    padding: "20px",
    height: "100%",
    overflowY: "auto" as const,
  },
  helpText: {
    color: "#4b5563",
    marginBottom: "16px",
  },
  helpSubtitle: {
    fontSize: "16px",
    fontWeight: "600",
    marginTop: "20px",
    marginBottom: "8px",
    color: "#1a73e8",
  },
  helpList: {
    paddingLeft: "20px",
    marginBottom: "16px",
  },
  helpListItem: {
    marginBottom: "8px",
  },
  helpLink: {
    color: "#1a73e8",
    textDecoration: "none",
  },
};

export default function Playground() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const documentIdentifier = searchParams.get("folder");
  const [nofoName, setNofoName] = useState("New NOFO");
  const [isLoading, setIsLoading] = useState(false);
  const appContext = useContext(AppContext);
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchNofoName = async () => {
      if (!documentIdentifier || !appContext) return;

      setIsLoading(true);
      try {
        const apiClient = new ApiClient(appContext);
        const summaryResult = await apiClient.landingPage.getNOFOSummary(
          documentIdentifier
        );

        if (summaryResult?.data?.GrantName) {
          setNofoName(summaryResult.data.GrantName);
        } else {
          const folderName = documentIdentifier.split("/").pop();
          setNofoName(folderName || "NOFO");
        }
      } catch (error) {
        console.error("Error fetching NOFO name:", error);
        const folderName = documentIdentifier.split("/").pop();
        setNofoName(folderName || "NOFO");
      } finally {
        setIsLoading(false);
      }
    };

    fetchNofoName();
  }, [documentIdentifier, appContext]);

  const goToDocumentEditor = () => {
    if (documentIdentifier) {
      navigate(
        `/document-editor/${documentIdentifier}?folder=${encodeURIComponent(
          documentIdentifier
        )}`
      );
    } else {
      navigate(`/document-editor/new`);
    }
  };

  const goToRequirements = () => {
    if (documentIdentifier) {
      navigate(`/landing-page/basePage/checklists/${documentIdentifier}`);
    }
  };

  return (
    <BaseAppLayout
      header={
        <div style={styles.headerContainer}>
          <h1 style={styles.headerTitle}>
            {isLoading ? "Loading..." : nofoName}
          </h1>
          <div style={styles.headerActions}>
            <button
              style={{ ...styles.actionButton, ...styles.primaryButton }}
              onClick={goToDocumentEditor}
            >
              <FileText size={16} /> Open Document Editor
            </button>
            <button
              style={{ ...styles.actionButton, ...styles.accentButton }}
              onClick={goToRequirements}
            >
              <CheckSquare size={16} /> View Key Requirements
            </button>
            <button
              style={{ ...styles.actionButton, ...styles.secondaryButton }}
              onClick={() => setHelpOpen((prevState) => !prevState)}
            >
              <HelpCircle size={16} /> View Help
            </button>
          </div>
        </div>
      }
      toolsOpenExternal={helpOpen}
      onToolsOpenChange={setHelpOpen}
      info={
        <div style={styles.helpPanel}>
          <h3 style={styles.helpTitle}>
            Welcome to the GrantWell chatbot interface!
          </h3>
          <p style={styles.helpText}>
            The purpose of this chatbot is to prompt you through the project
            narrative section of your grant. For GrantWell to work best, upload
            supplementary data through the "upload data" button to best help us
            craft a narrative that reflects your organization.
          </p>

          <div>
            <p style={styles.helpText}>Examples of data could include:</p>
            <ul style={styles.helpList}>
              <li style={styles.helpListItem}>Last year's annual report</li>
              <li style={styles.helpListItem}>Latest accomplishments</li>
              <li style={styles.helpListItem}>
                Previously submitted proposals for this grant
              </li>
              <li style={styles.helpListItem}>Project narrative template</li>
            </ul>
          </div>

          <p style={styles.helpText}>
            Ensure you upload all supplementary data before beginning
            conversation with the chatbot.
          </p>

          <h4 style={styles.helpSubtitle}>Sources</h4>
          <p style={styles.helpText}>
            If the chatbot references any files you've uploaded, they will show
            up underneath the relevant message. Add or delete files through the
            "upload data" button.
          </p>

          <h4 style={styles.helpSubtitle}>Session history</h4>
          <p style={styles.helpText}>
            All conversations are saved and can be later accessed via the{" "}
            <Link to="/chatbot/sessions" style={styles.helpLink}>
              Sessions
            </Link>{" "}
            page.
          </p>
        </div>
      }
      documentIdentifier={documentIdentifier}
      toolsWidth={300}
      content={
        <div
          style={{ height: "100%", display: "flex", flexDirection: "column" }}
        >
          <Chat sessionId={sessionId} documentIdentifier={documentIdentifier} />
        </div>
      }
    />
  );
}
