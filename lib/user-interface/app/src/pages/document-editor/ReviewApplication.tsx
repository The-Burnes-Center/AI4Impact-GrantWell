import React, { useState, useEffect, useContext } from "react";
import { AppContext } from "../../common/app-context";
import { ApiClient } from "../../common/api-client/api-client";
import { Auth } from "aws-amplify";
import { jsPDF } from "jspdf";

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

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 40;

    // Header
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text("SAFE STREETS FOR ALL GRANT APPLICATION", pageWidth / 2, y, { align: "center" });
    y += 28;
    doc.setFontSize(14);
    doc.setFont(undefined, "normal");
    doc.text(draftData.title || "", pageWidth / 2, y, { align: "center" });
    y += 24;

    // Project Basics
    doc.setFontSize(12);
    if (draftData.projectBasics) {
      Object.entries(draftData.projectBasics).forEach(([key, value]) => {
        doc.text(`${key}: ${value}`, pageWidth / 2, y, { align: "center" });
        y += 16;
      });
    }
    y += 10;
    doc.setDrawColor(200);
    doc.line(40, y, pageWidth - 40, y);
    y += 20;

    // Table of Contents
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text("TABLE OF CONTENTS", 50, y);
    y += 20;
    doc.setFont(undefined, "normal");
    const sectionNames = draftData.sections ? Object.keys(draftData.sections) : [];
    const tocStartY = y;
    const tocEntries = [];
    sectionNames.forEach((name, idx) => {
      // Store Y position for page number
      const sectionText = `${idx + 1}. ${name}`;
      const leftX = 60;
      const rightX = pageWidth - 80;
      doc.text(sectionText, leftX, y, { align: "left" });
      // Dotted line
      const textWidth = doc.getTextWidth(sectionText);
      const dotsStart = leftX + textWidth + 5;
      const dotsEnd = rightX - 25;
      const dotY = y - 3;
      for (let x = dotsStart; x < dotsEnd; x += 4) {
        doc.line(x, dotY, x + 2, dotY);
      }
      // Store Y position for later page number writing
      tocEntries.push({ name, y });
      y += 16;
    });
    y += 10;
    doc.line(40, y, pageWidth - 40, y);
    y += 30;

    // Sections
    const sectionPageNumbers = [];
    sectionNames.forEach((name, idx) => {
      // If we're about to overflow, add a page
      if (y > 700) {
        doc.addPage();
        y = 40;
      }
      // Record page number for TOC after any page break
      sectionPageNumbers.push({ name, page: doc.getCurrentPageInfo().pageNumber });
      doc.setFontSize(13);
      doc.setFont(undefined, "bold");
      doc.text(`${idx + 1}. ${name.toUpperCase()}`, 50, y);
      y += 18;
      doc.setFontSize(12);
      doc.setFont(undefined, "normal");
      const content = draftData.sections[name] || "";
      const lines = doc.splitTextToSize(content, pageWidth - 100);
      doc.text(lines, 60, y);
      y += lines.length * 14 + 18;
      if (y > 700 && idx < sectionNames.length - 1) {
        doc.addPage();
        y = 40;
      }
    });

    // After all sections, go back and write page numbers in TOC
    doc.setPage(1);
    doc.setFontSize(13);
    doc.setFont(undefined, "normal");
    tocEntries.forEach((entry, idx) => {
      const pageNum = sectionPageNumbers.find(s => s.name === entry.name)?.page || 1;
      const pageText = `Page ${pageNum}`;
      doc.text(pageText, pageWidth - 80, entry.y, { align: "right" });
    });

    // Add footer only to the last page
    const pageCount = doc.getNumberOfPages();
    doc.setPage(pageCount);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(
      "Generated by AI. Please review and edit as needed before submission.",
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: "center" }
    );

    doc.save("grant-application.pdf");
  };

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "32px 0",
      }}
    >
      <p
        style={{
          color: "#3d4451",
          marginBottom: "24px",
        }}
      >
        Review your application before exporting it. You can go back to edit any
        section if needed.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          padding: "16px",
          borderRadius: "8px",
          marginBottom: "24px",
          background: compliancePassed ? "#f0fff4" : "#fffbeb",
          border: `1px solid ${compliancePassed ? "#c6f6d5" : "#fef3c7"}`,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          style={{
            width: "24px",
            height: "24px",
            stroke: compliancePassed ? "#10b981" : "#f59e0b",
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
              color: compliancePassed ? "#047857" : "#b45309",
              marginBottom: "4px",
            }}
          >
            {compliancePassed
              ? "Compliance Check Passed!"
              : "Some sections are incomplete"}
          </h3>
          <p
            style={{
              color: compliancePassed ? "#065f46" : "#92400e",
              margin: 0,
            }}
          >
            {compliancePassed
              ? "Your application meets all the requirements for submission. All required sections are complete and formatted correctly."
              : "Please complete all required sections before exporting your application."}
          </p>
        </div>
      </div>

      <div style={{ marginBottom: "24px" }}>
        {sections.map((section, idx) => {
          const isComplete =
            (sectionAnswers[section.name] || "").trim().length > 0;
          const previewContent = sectionAnswers[section.name]
            ? sectionAnswers[section.name].length > 200
              ? sectionAnswers[section.name].slice(0, 200) + "..."
              : sectionAnswers[section.name]
            : "";

          return (
            <div
              key={idx}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                overflow: "hidden",
                marginBottom: "16px",
                background: "white",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "16px",
                  background: "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <h3
                  style={{
                    fontWeight: 500,
                    fontSize: "16px",
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  {section.name}
                </h3>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                  }}
                >
                  {isComplete ? (
                    <span
                      style={{
                        fontSize: "14px",
                        color: "#10b981",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        style={{
                          width: "16px",
                          height: "16px",
                          stroke: "currentColor",
                          fill: "none",
                          strokeWidth: 2,
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                          marginRight: "4px",
                        }}
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <path d="M22 4 12 14.01l-3-3"></path>
                      </svg>
                      Complete
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: "14px",
                        color: "#f59e0b",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        style={{
                          width: "16px",
                          height: "16px",
                          stroke: "currentColor",
                          fill: "none",
                          strokeWidth: 2,
                          strokeLinecap: "round",
                          strokeLinejoin: "round",
                          marginRight: "4px",
                        }}
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      Incomplete
                    </span>
                  )}
                  <button
                    style={{
                      display: "flex",
                      alignItems: "center",
                      background: "none",
                      border: "none",
                      color: "#2c4fdb",
                      fontSize: "14px",
                      cursor: "pointer",
                      padding: "4px 8px",
                    }}
                    onClick={() => goToSection(idx)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      style={{
                        width: "14px",
                        height: "14px",
                        stroke: "currentColor",
                        fill: "none",
                        strokeWidth: 2,
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                        marginRight: "4px",
                      }}
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    Edit
                  </button>
                </div>
              </div>
              <div
                style={{
                  padding: "16px",
                  color: "#374151",
                }}
              >
                <p style={{ margin: 0 }}>
                  {isComplete ? (
                    previewContent
                  ) : (
                    <span style={{ fontStyle: "italic", color: "#6e747f" }}>
                      No content yet
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            background: "#f9fafb",
            padding: "16px",
            textAlign: "center",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#5a6169",
              marginBottom: "4px",
            }}
          >
            Word Count
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "24px",
              color: "#111827",
            }}
          >
            {stats.wordCount}
          </div>
        </div>
        <div
          style={{
            background: "#f9fafb",
            padding: "16px",
            textAlign: "center",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#5a6169",
              marginBottom: "4px",
            }}
          >
            Pages (approx.)
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "24px",
              color: "#111827",
            }}
          >
            {stats.pageCount}
          </div>
        </div>
        <div
          style={{
            background: "#f9fafb",
            padding: "16px",
            textAlign: "center",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#5a6169",
              marginBottom: "4px",
            }}
          >
            Sections Complete
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "24px",
              color: "#111827",
            }}
          >
            {stats.complete} of {sections.length}
          </div>
        </div>
      </div>

      <div
        style={{
          background: "#f0f4ff",
          padding: "24px",
          borderRadius: "8px",
          marginBottom: "32px",
          border: "1px solid #d4daff",
        }}
      >
        <h3
          style={{
            fontWeight: 600,
            fontSize: "18px",
            color: "#111827",
            marginBottom: "16px",
          }}
        >
          Next Steps
        </h3>
        <ol
          style={{
            marginLeft: "20px",
            color: "#374151",
            paddingLeft: 0,
          }}
        >
          <li style={{ marginBottom: "8px" }}>
            Export your application in the required format (PDF)
          </li>
          <li style={{ marginBottom: "8px" }}>
            Submit the PDF through the grants.gov portal
          </li>
          <li>Complete the SF-424 form (separate from this application)</li>
        </ol>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={() => onNavigate("sections")}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 20px",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            color: "#374151",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "18px",
              height: "18px",
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
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 24px",
            background: compliancePassed ? "#2c4fdb" : "#d1d5db",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "16px",
            fontWeight: 500,
            cursor: compliancePassed ? "pointer" : "not-allowed",
            opacity: compliancePassed ? 1 : 0.7,
          }}
          disabled={!compliancePassed}
        >
          <svg
            viewBox="0 0 24 24"
            style={{
              width: "18px",
              height: "18px",
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
          Export Application
        </button>
      </div>
    </div>
  );
};

export default ReviewApplication;
