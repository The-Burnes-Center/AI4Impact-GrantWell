import { Breadcrumb, Container, Alert, Nav, Tab } from "react-bootstrap";
import BaseAppLayout from "../../components/base-app-layout";
import DocumentsTab from "./documents-tab";
import { CHATBOT_NAME } from "../../common/constants";
import { useState, useContext } from "react";
import DataFileUpload from "./file-upload-tab";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import "bootstrap/dist/css/bootstrap.min.css";

export default function DataPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("file");
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [lastSyncTime, setLastSyncTime] = useState("")
  const [showUnsyncedAlert, setShowUnsyncedAlert] = useState(false);

  /** Function to get the last synced time */
  const refreshSyncTime = async () => {
    try {
      const lastSync = await apiClient.knowledgeManagement.lastKendraSync();    
      setLastSyncTime(lastSync);
    } catch (e) {
      console.log(e);
    }
  }

  return (
    <BaseAppLayout
      contentType="cards"
      breadcrumbs={
        <Breadcrumb>
          <Breadcrumb.Item 
            onClick={() => navigate(`/chatbot/playground/${uuidv4()}`)}
            style={{ cursor: "pointer" }}
          >
            {CHATBOT_NAME}
          </Breadcrumb.Item>
          <Breadcrumb.Item active>View Data</Breadcrumb.Item>
        </Breadcrumb>
      }
      content={
        <Container fluid className="p-4">
          <h1 className="mb-4">Data Dashboard</h1>
          <div className="mb-4">
            <div className="card">
              <div className="card-header">
                <h3 className="mb-0">Last successful sync: {lastSyncTime}</h3>
              </div>
              <div className="card-body">
                <p className="mb-2">
                  Manage the chatbot's data here. You can view, add, or remove data for the chatbot to reference.
                </p>
                <p className="mb-2">
                  Please make sure to sync data with the chatbot when you are done adding or removing new files.
                </p>
                {showUnsyncedAlert && (
                  <Alert variant="warning" dismissible onClose={() => setShowUnsyncedAlert(false)}>
                    Some files have been added or modified since the last sync.
                    Please sync the data to ensure the chatbot has the latest
                    information.
                  </Alert>
                )}
              </div>
            </div>
          </div>
          <Tab.Container activeKey={activeTab} onSelect={(k) => k && setActiveTab(k)}>
            <Nav variant="tabs">
              <Nav.Item>
                <Nav.Link eventKey="file">Current Files</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="add-data">Add Files</Nav.Link>
              </Nav.Item>
            </Nav>
            <Tab.Content className="mt-3">
              <Tab.Pane eventKey="file">
                <DocumentsTab
                  tabChangeFunction={() => setActiveTab("add-data")}
                  documentType="file"
                  statusRefreshFunction={refreshSyncTime}
                  lastSyncTime={lastSyncTime}
                  setShowUnsyncedAlert={setShowUnsyncedAlert}
                />
              </Tab.Pane>
              <Tab.Pane eventKey="add-data">
                <DataFileUpload 
                  tabChangeFunction={() => setActiveTab("file")}
                />
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>
        </Container>
      }
    />
  );
}
