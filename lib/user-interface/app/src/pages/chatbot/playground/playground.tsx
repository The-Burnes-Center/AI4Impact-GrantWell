import React, { useState, useEffect, useContext } from "react";
import BaseAppLayout from "./base-app-layout";
import Chat from "../../../components/chatbot/chat";
import {
  Link,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { HelpCircle, Upload } from "lucide-react";
import { ApiClient } from "../../../common/api-client/api-client";
import { AppContext } from "../../../common/app-context";
import UploadModal from "../../../components/chatbot/upload-modal";

// Styles for components
const styles: Record<string, React.CSSProperties> = {
  headerContainer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid #e5e7eb",
    backgroundColor: "white",
  },
  headerTitle: {
    fontSize: "24px",
    fontWeight: 600,
    color: "#111827",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "60%",
    margin: 0,
  },
  headerActions: {
    display: "flex",
    gap: "12px",
  },
  uploadButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    backgroundColor: "#0073bb",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
  },
  helpButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    backgroundColor: "#f3f4f6",
    color: "#374151",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
  },
  helpPanel: {
    padding: "20px",
    height: "100%",
    overflowY: "auto",
  },
  helpTitle: {
    color: "#0073bb",
    fontSize: "18px",
    fontWeight: 600,
    marginBottom: "16px",
  },
  helpText: {
    color: "#374151",
    marginBottom: "16px",
  },
  helpSubtitle: {
    fontSize: "16px",
    fontWeight: "600",
    marginTop: "20px",
    marginBottom: "8px",
    color: "#0073bb",
  },
  helpList: {
    paddingLeft: "20px",
    marginBottom: "16px",
  },
  helpListItem: {
    marginBottom: "8px",
  },
  helpLink: {
    color: "#0073bb",
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
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

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

  const handleUploadData = () => {
    setUploadModalOpen(true);
  };

  return (
    <BaseAppLayout
      header={
        <div style={styles.headerContainer}>
          <h1 style={styles.headerTitle}>
            {isLoading ? "Loading..." : nofoName}
          </h1>
          <div style={styles.headerActions}>
            {/* Upload Data button - only show if documentIdentifier exists */}
            {documentIdentifier && (
              <button style={styles.uploadButton} onClick={handleUploadData}>
                <Upload size={16} /> Upload Data
              </button>
            )}
            <button
              style={styles.helpButton}
              onClick={() => setHelpOpen(!helpOpen)}
            >
              <HelpCircle size={16} /> {helpOpen ? "Hide Help" : "View Help"}
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
            narrative section of your grant. GrantWell will help you craft a
            narrative that reflects your organization.
          </p>

          <p style={styles.helpText}>
            The chatbot will guide you through creating your project narrative
            by asking relevant questions and providing suggestions based on
            grant requirements.
          </p>

          <h4 style={styles.helpSubtitle}>Upload Documents</h4>
          <p style={styles.helpText}>
            Click "Upload Data" to upload supporting documents (mission statements, 
            past projects, organizational charts, etc.) that will help the chatbot 
            provide more contextual and relevant responses for this grant.
          </p>

          <h4 style={styles.helpSubtitle}>Sources</h4>
          <p style={styles.helpText}>
            If the chatbot references any files from the knowledge base, they will show
            up underneath the relevant message.
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
          {/* Upload Modal - only render if documentIdentifier exists */}
          {documentIdentifier && (
            <UploadModal
              isOpen={uploadModalOpen}
              onClose={() => setUploadModalOpen(false)}
              documentIdentifier={documentIdentifier}
            />
          )}
        </div>
      }
    />
  );
}
