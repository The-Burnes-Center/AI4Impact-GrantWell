import React, { useState, useEffect, useContext } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";

interface ReviewApplicationProps {
  onExport: () => void;
  selectedNofo: string | null;
  sessionId: string;
  onNavigate: (step: string) => void;
}

interface Section {
  name: string;
  description: string;
}

const ReviewApplication: React.FC<ReviewApplicationProps> = ({
  onExport,
  selectedNofo,
  sessionId,
  onNavigate,
}) => {
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionAnswers, setSectionAnswers] = useState<{
    [key: string]: string;
  }>({});
  const [compliancePassed, setCompliancePassed] = useState(false);
  const [stats, setStats] = useState({
    wordCount: 0,
    pageCount: 0,
    complete: 0,
  });
  const appContext = useContext(AppContext);

  useEffect(() => {
    const fetchDraftData = async () => {
      if (!appContext || !selectedNofo) return;

      try {
        const apiClient = new ApiClient(appContext);
        const username = (await Auth.currentAuthenticatedUser()).username;
        
        // Get draft from database
        const currentDraft = await apiClient.drafts.getDraft({
          sessionId: sessionId,
          userId: username
        });

        if (currentDraft) {
          // Set sections from draft
          if (currentDraft.sections) {
            setSectionAnswers(currentDraft.sections);
          }

          // Set sections from NOFO summary
          const result = await apiClient.landingPage.getNOFOSummary(selectedNofo);
          if (result?.data?.ProjectNarrativeSections) {
            const apiSections = result.data.ProjectNarrativeSections;
            if (Array.isArray(apiSections) && apiSections.length > 0) {
              setSections(apiSections.map(section => ({
                name: section.item || "Untitled Section",
                description: section.description || "No description provided."
              })));
            }
          }
        }
      } catch (error) {
        console.error("Error loading draft data:", error);
      }
    };

    fetchDraftData();
  }, [appContext, selectedNofo, sessionId]);

  useEffect(() => {
    // Compliance: all sections must be non-empty
    if (sections.length > 0) {
      const complete = sections.filter(
        (s) => (sectionAnswers[s.name] || "").trim().length > 0
      ).length;
      setCompliancePassed(complete === sections.length);

      // Calculate stats
      const allText = sections
        .map((s) => sectionAnswers[s.name] || "")
        .join(" ");
      const wordCount = allText.trim().split(/\s+/).filter(Boolean).length;
      const pageCount = Math.max(1, Math.round(wordCount / 300));
      setStats({ wordCount, pageCount, complete });
    }
  }, [sections, sectionAnswers]);

  const goToSection = (idx: number) => {
    onNavigate("sections");
  };

  const handleExportPDF = async () => {
    // Gather all application data
    let draftData = null;
    if (appContext && selectedNofo) {
      try {
        const apiClient = new ApiClient(appContext);
        const username = (await Auth.currentAuthenticatedUser()).username;
        draftData = await apiClient.drafts.getDraft({
          sessionId: sessionId,
          userId: username
        });
      } catch (error) {
        console.error("Error fetching draft for PDF export:", error);
        alert("Failed to fetch draft data for export.");
        return;
      }
    }
    if (!draftData) {
      alert("No draft data available for export.");
      return;
    }

    try {
      const apiClient = new ApiClient(appContext!);
      
      // Generate PDF using Lambda function
      const pdfBlob = await apiClient.drafts.generatePDF({
        title: draftData.title,
        projectBasics: draftData.projectBasics,
        sections: draftData.sections,
      });

      // Create a download link and trigger download
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'grant-application.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "32px",
        background: "white",
      }}
    >
      {/* Application Summary Section */}
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px",
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "24px",
              height: "24px",
              stroke: "#0088FF",
              fill: "none",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              marginRight: "12px",
            }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <line x1="10" y1="9" x2="8" y2="9"></line>
          </svg>
          <h2
            style={{
              fontSize: "22px",
              fontWeight: 600,
              color: "#111827",
              margin: 0,
            }}
          >
            Application Summary
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              background: "#f9fafb",
              padding: "24px",
              textAlign: "center",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: "48px",
                color: "#2563eb",
                marginBottom: "8px",
              }}
            >
              {stats.wordCount}
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111827",
                marginBottom: "4px",
              }}
            >
              Total Word Count
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#6b7280",
              }}
            >
              Across all sections
            </div>
          </div>

          <div
            style={{
              background: "#f9fafb",
              padding: "24px",
              textAlign: "center",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: "48px",
                color: "#9333ea",
                marginBottom: "8px",
              }}
            >
              {stats.pageCount}
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111827",
                marginBottom: "4px",
              }}
            >
              Estimated Pages
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#6b7280",
              }}
            >
              In PDF format
            </div>
          </div>

          <div
            style={{
              background: "#f9fafb",
              padding: "24px",
              textAlign: "center",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: "48px",
                color: compliancePassed ? "#047857" : "#d97706",
                marginBottom: "8px",
              }}
            >
              {stats.complete}/{sections.length}
            </div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111827",
                marginBottom: "4px",
              }}
            >
              Completion Status
            </div>
            <div
              style={{
                fontSize: "14px",
                color: "#6b7280",
              }}
            >
              Sections complete
            </div>
          </div>
        </div>

        {/* Compliance Check Message */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            padding: "16px",
            borderRadius: "8px",
            background: compliancePassed ? "#f0fff4" : "#fffbeb",
            border: `1px solid ${compliancePassed ? "#c6f6d5" : "#fef3c7"}`,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "24px",
              height: "24px",
              stroke: compliancePassed ? "#047857" : "#d97706",
              fill: "none",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              marginRight: "16px",
              flexShrink: 0,
              marginTop: "4px",
            }}
          >
            {compliancePassed ? (
              <>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <path d="M22 4 12 14.01l-3-3"></path>
              </>
            ) : (
              <>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </>
            )}
          </svg>
          <div>
            <h3
              style={{
                fontWeight: 600,
                fontSize: "18px",
                color: compliancePassed ? "#065f46" : "#92400e",
                marginBottom: "4px",
              }}
            >
              {compliancePassed
                ? "Compliance Check Passed!"
                : "Some sections are incomplete"}
            </h3>
            <p
              style={{
                color: compliancePassed ? "#047857" : "#78350f",
                margin: 0,
              }}
            >
              {compliancePassed
                ? "Your application meets all the requirements for submission. All required sections are complete and formatted correctly."
                : "Please complete all required sections before exporting your application."}
            </p>
          </div>
        </div>
      </div>

      {/* Before You Export Section */}
      <div
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "24px",
          border: "1px solid #e5e7eb",
        }}
      >
        <h3
          style={{
            fontSize: "20px",
            fontWeight: 600,
            color: "#111827",
            marginBottom: "20px",
            marginTop: 0,
          }}
        >
          Before You Export
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          {/* <button
            style={{
              display: "flex",
              alignItems: "center",
              padding: "20px",
              background: "#eff6ff",
              border: "2px solid #3b82f6",
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#dbeafe";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#eff6ff";
              e.currentTarget.style.transform = "translateY(0)";
            }}
            aria-label="Preview full application (coming soon)"
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                background: "#3b82f6",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: "16px",
                flexShrink: 0,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                style={{
                  width: "24px",
                  height: "24px",
                  stroke: "white",
                  fill: "none",
                  strokeWidth: 2,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                }}
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </div>
            <div style={{ textAlign: "left" }}>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#1e40af",
                  marginBottom: "4px",
                }}
              >
                Preview Full Application
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "#1e40af",
                }}
              >
                View as a single document
              </div>
            </div>
          </button> */}

          <button
            onClick={() => onNavigate("sectionEditor")}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "20px",
              background: "#fef3c7",
              border: "2px solid #f59e0b",
              borderRadius: "12px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#fde68a";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fef3c7";
              e.currentTarget.style.transform = "translateY(0)";
            }}
            aria-label="Make final edits - return to section editor"
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                background: "#f59e0b",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: "16px",
                flexShrink: 0,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                style={{
                  width: "24px",
                  height: "24px",
                  stroke: "white",
                  fill: "none",
                  strokeWidth: 2,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                }}
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </div>
            <div style={{ textAlign: "left" }}>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#92400e",
                  marginBottom: "4px",
                }}
              >
                Make Final Edits
              </div>
              <div
                style={{
                  fontSize: "14px",
                  color: "#92400e",
                }}
              >
                Return to section editor
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* What Happens After Export Section */}
      <div
        style={{
          background: "#eff6ff",
          borderRadius: "12px",
          padding: "24px",
          marginBottom: "32px",
          border: "2px solid #3b82f6",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "24px",
              height: "24px",
              stroke: "#1e40af",
              fill: "none",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              marginRight: "12px",
            }}
          >
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#1e40af",
              margin: 0,
            }}
          >
            What Happens After Export?
          </h3>
        </div>
        <ul
          style={{
            marginLeft: "20px",
            color: "#1e40af",
            paddingLeft: "16px",
            marginTop: 0,
            marginBottom: 0,
          }}
        >
          <li style={{ marginBottom: "8px", lineHeight: 1.6 }}>
            You'll download a professionally formatted PDF of your application
          </li>
          <li style={{ marginBottom: "8px", lineHeight: 1.6 }}>
            Submit the PDF through the official grants.gov portal
          </li>
          <li style={{ lineHeight: 1.6 }}>
            Complete the SF-424 form separately (if required)
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <button
          onClick={() => onNavigate("sectionEditor")}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 24px",
            background: "white",
            border: "2px solid #e5e7eb",
            borderRadius: "8px",
            color: "#374151",
            fontSize: "16px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f9fafb";
            e.currentTarget.style.borderColor = "#d1d5db";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "white";
            e.currentTarget.style.borderColor = "#e5e7eb";
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "20px",
              height: "20px",
              stroke: "currentColor",
              fill: "none",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              marginRight: "8px",
            }}
          >
            <path d="M19 12H5"></path>
            <path d="m12 19-7-7 7-7"></path>
          </svg>
          Back to Editing
        </button>

        <button
          onClick={handleExportPDF}
          disabled={!compliancePassed}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 32px",
            background: compliancePassed ? "#047857" : "#d1d5db",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: 600,
            cursor: compliancePassed ? "pointer" : "not-allowed",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (compliancePassed) {
              e.currentTarget.style.background = "#065f46";
            }
          }}
          onMouseLeave={(e) => {
            if (compliancePassed) {
              e.currentTarget.style.background = "#047857";
            }
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "20px",
              height: "20px",
              stroke: "currentColor",
              fill: "none",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              marginRight: "8px",
            }}
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Export Application as PDF
        </button>
      </div>
    </div>
  );
};

export default ReviewApplication;

