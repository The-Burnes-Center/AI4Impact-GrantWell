import React, { useState, useEffect, useContext } from "react";
import {
  useParams,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Box,
  Header,
  SpaceBetween,
  Button,
  Tabs,
  Spinner,
  SegmentedControl,
} from "@cloudscape-design/components";
import BaseAppLayout from "../../components/base-app-layout";
// import ReqNav from '../../components/req-nav';
import ReactMarkdown from "react-markdown";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import "../../styles/checklists.css";
import BackArrowIcon from "../../../public/images/back-arrow.jsx";
import ForwardArrowIcon from "../../../public/images/forward-arrow.jsx";
import { v4 as uuidv4 } from "uuid";
import QueryChat from "./querychat.tsx";
// Remove unused import
// import QueryBot from "./querybot.tsx";

export interface SectionProps {
  title: string;
  content: string;
  isOpenDefault?: boolean;
}

export default function Checklists() {
  const navigate = useNavigate();
  const location = useLocation();
  const { documentIdentifier } = useParams();
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get("folder") || documentIdentifier;
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [llmData, setLlmData] = useState({
    grantName: "",
    eligibility: "",
    documents: "",
    narrative: "",
    deadlines: "",
  });
  const [isloading, setLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState("seg-2");
  const [activeTabId, setActiveTabId] = useState("eligibility");

  useEffect(() => {
    // Get the hash from the URL (removing the # symbol)
    const hash = window.location.hash.replace("#", "");
    // If there's a valid hash that matches one of our tab IDs, set it as active
    if (["eligibility", "narrative", "documents", "deadlines"].includes(hash)) {
      setActiveTabId(hash);
    }
  }, [location]); // React to location changes

  const getNOFOSummary = async () => {
    try {
      const result = await apiClient.landingPage.getNOFOSummary(
        documentIdentifier
      );
      setLlmData({
        grantName: result.data.GrantName,
        narrative: result.data.ProjectNarrativeSections.map(
          (section) => `- **${section.item}**: ${section.description}`
        ).join("\n"),
        eligibility: result.data.EligibilityCriteria.map(
          (criterion) => `- **${criterion.item}**: ${criterion.description}`
        ).join("\n"),
        documents: result.data.RequiredDocuments.map(
          (doc) => `- **${doc.item}**: ${doc.description}`
        ).join("\n"),
        deadlines: result.data.KeyDeadlines.map(
          (deadline) => `- **${deadline.item}**: ${deadline.description}`
        ).join("\n"),
      });
    } catch (error) {
      console.error("Error loading NOFO summary: ", error);
    } finally {
      setLoading(false);
    }
  };

  const { documentUrl } = useParams<{ documentUrl: string }>();
  useEffect(() => {
    getNOFOSummary();
  }, [documentUrl]);

  const linkUrl = `/chatbot/playground/${uuidv4()}?folder=${encodeURIComponent(
    documentIdentifier
  )}`;

  return (
    <div
      style={{
        display: "flex",
        height: "100vh", // Ensures full screen
        width: "100%",
      }}
    >
      <BaseAppLayout
        documentIdentifier={folderParam}
        content={
          <SpaceBetween direction="vertical" size="xl">
            <div
              style={{
                display: "flex",
                height: "calc(100vh - 100px)",
                width: "100%",
              }}
            >
              {/* Main Content Area */}
              <div
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  minWidth: 0,
                  overflowY: "auto",
                }}
              >
                <Box padding="m">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem", // Spacing between items
                      flexWrap: "wrap", // Ensure items wrap if the screen is too narrow
                      marginTop: "15px",
                      marginBottom: "0px", // Space below the toolbar
                    }}
                  ></div>
                  {isloading ? (
                    <Box textAlign="center">
                      <Spinner size="large" />
                      <p>Loading...</p>
                    </Box>
                  ) : (
                    <>
                      <Header variant="h1">
                        <span style={{ color: "#000000" }}>
                          Application Requirements for{" "}
                        </span>
                        <span style={{ color: "#006499" }}>
                          {llmData.grantName}
                        </span>
                      </Header>
                      <p
                        style={{
                          fontSize: "16px",
                          color: "#555",
                          marginTop: "10px",
                          marginBottom: "20px",
                          maxWidth: "950px",
                        }}
                      >
                        We've extracted the Eligibility Criteria, Required
                        Documents, Project Narrative Components, and Key
                        Deadlines for this grant.
                      </p>
                      <p
                        style={{
                          fontSize: "16px",
                          color: "#555",
                          marginTop: "10px",
                          marginBottom: "20px",
                        }}
                      >
                        Use the tabs below to navigate through each section.
                      </p>
                      {/* Tabs for Navigation */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center", // Horizontal centering
                          marginTop: "15px",
                          marginBottom: "10px",
                          width: "100%", // Ensures the container spans full width
                        }}
                      >
                        <Tabs
                          activeTabId={activeTabId}
                          onChange={({ detail }) =>
                            setActiveTabId(detail.activeTabId)
                          }
                          tabs={[
                            {
                              label: "Eligibility Criteria",
                              id: "eligibility",
                              content: (
                                <Box margin={{ top: "m" }}>
                                  <p
                                    style={{
                                      fontSize: "16px",
                                      color: "#555",
                                      marginTop: "10px",
                                      marginBottom: "20px",
                                    }}
                                  >
                                    Ensure you adhere to the extracted
                                    eligibility criteria before continuing with
                                    your application.
                                  </p>
                                  <ReactMarkdown className="custom-markdown">
                                    {llmData.eligibility}
                                  </ReactMarkdown>
                                </Box>
                              ),
                            },
                            {
                              label: "Required Documents",
                              id: "documents",
                              content: (
                                <Box margin={{ top: "m" }}>
                                  <p
                                    style={{
                                      fontSize: "16px",
                                      color: "#555",
                                      marginTop: "10px",
                                      marginBottom: "20px",
                                    }}
                                  >
                                    Include the following documents in your
                                    proposal.
                                  </p>
                                  <ReactMarkdown className="custom-markdown">
                                    {llmData.documents}
                                  </ReactMarkdown>
                                </Box>
                              ),
                            },
                            {
                              label: "Project Narrative Components",
                              id: "narrative",
                              content: (
                                <Box margin={{ top: "m" }}>
                                  <p
                                    style={{
                                      fontSize: "16px",
                                      color: "#555",
                                      marginTop: "10px",
                                      marginBottom: "20px",
                                    }}
                                  >
                                    The following sections must be included in
                                    the project narrative. Navigate to the
                                    chatbot through the toolbar for help
                                    crafting a narrative draft.
                                  </p>

                                  <ReactMarkdown className="custom-markdown">
                                    {llmData.narrative}
                                  </ReactMarkdown>
                                </Box>
                              ),
                            },
                            {
                              label: "Key Deadlines",
                              id: "deadlines",
                              content: (
                                <Box margin={{ top: "m" }}>
                                  <p
                                    style={{
                                      fontSize: "16px",
                                      color: "#555",
                                      marginTop: "10px",
                                      marginBottom: "20px",
                                    }}
                                  >
                                    Note the following key deadlines for this
                                    grant.
                                  </p>
                                  <ReactMarkdown className="custom-markdown">
                                    {llmData.deadlines}
                                  </ReactMarkdown>
                                </Box>
                              ),
                            },
                          ]}
                          variant="default"
                        />
                      </div>
                      <p
                        style={{
                          fontSize: "16px",
                          color: "#555",
                          marginTop: "10px",
                          marginBottom: "50px",
                        }}
                      >
                        When you're ready, navigate to the chatbot using the
                        button above to start drafting your project proposal.
                      </p>
                    </>
                  )}
                </Box>
              </div>
            </div>
          </SpaceBetween>
        }
      />
      {/* Pass the document identifier to QueryChat */}
      <QueryChat />
    </div>
  );
}