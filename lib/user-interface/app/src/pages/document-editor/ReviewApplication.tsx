import React, { useState, useEffect } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { Auth } from "aws-amplify";
import {
  FileText,
  Download,
  ArrowLeft,
  Edit,
  Info,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import "../../styles/document-editor.css";

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
  const [sectionAnswers, setSectionAnswers] = useState<Record<string, string>>({});
  const [compliancePassed, setCompliancePassed] = useState(false);
  const [stats, setStats] = useState({ wordCount: 0, pageCount: 0, complete: 0 });
  const apiClient = useApiClient();

  useEffect(() => {
    const fetchDraftData = async () => {
      if (!selectedNofo) return;

      try {
        const username = (await Auth.currentAuthenticatedUser()).username;

        const currentDraft = await apiClient.drafts.getDraft({
          sessionId: sessionId,
          userId: username,
        });

        if (currentDraft) {
          if (currentDraft.sections) {
            setSectionAnswers(currentDraft.sections);
          }

          const result =
            await apiClient.landingPage.getNOFOSummary(selectedNofo);
          if (result?.data?.ProjectNarrativeSections) {
            const apiSections = result.data.ProjectNarrativeSections;
            if (Array.isArray(apiSections) && apiSections.length > 0) {
              setSections(
                apiSections.map((section) => ({
                  name: section.item || "Untitled Section",
                  description:
                    section.description || "No description provided.",
                }))
              );
            }
          }
        }
      } catch (error) {
        console.error("Error loading draft data:", error);
      }
    };

    fetchDraftData();
  }, [apiClient, selectedNofo, sessionId]);

  useEffect(() => {
    if (sections.length > 0) {
      const complete = sections.filter(
        (s) => (sectionAnswers[s.name] || "").trim().length > 0
      ).length;
      setCompliancePassed(complete === sections.length);

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
    let draftData = null;
    let grantName = null;
    if (selectedNofo) {
      try {
        const username = (await Auth.currentAuthenticatedUser()).username;
        draftData = await apiClient.drafts.getDraft({
          sessionId: sessionId,
          userId: username,
        });

        const nofoSummary =
          await apiClient.landingPage.getNOFOSummary(selectedNofo);
        if (nofoSummary?.data?.GrantName) {
          grantName = nofoSummary.data.GrantName;
        }
      } catch (error) {
        console.error("Error fetching draft for PDF export:", error);
        return;
      }
    }
    if (!draftData) {
      console.error("No draft data available for export.");
      return;
    }

    try {
      const pdfBlob = await apiClient.drafts.generatePDF({
        title: draftData.title,
        grantName: grantName || undefined,
        projectBasics: draftData.projectBasics,
        sections: draftData.sections,
      });

      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "grant-application.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
    }
  };

  const complianceClass = compliancePassed
    ? "ra-compliance--passed"
    : "ra-compliance--incomplete";

  return (
    <div className="ra-container">
      {/* Application Summary Section */}
      <div className="ra-card">
        <div className="ra-header">
          <FileText className="ra-header__icon" aria-hidden="true" />
          <h2 className="ra-header__title">Application Summary</h2>
        </div>

        <div className="ra-stats-grid">
          <div className="ra-stat-card">
            <div className="ra-stat-card__value ra-stat-card__value--words">
              {stats.wordCount}
            </div>
            <div className="ra-stat-card__label">Total Word Count</div>
            <div className="ra-stat-card__sublabel">Across all sections</div>
          </div>

          <div className="ra-stat-card">
            <div className="ra-stat-card__value ra-stat-card__value--pages">
              {stats.pageCount}
            </div>
            <div className="ra-stat-card__label">Estimated Pages</div>
            <div className="ra-stat-card__sublabel">In PDF format</div>
          </div>

          <div className="ra-stat-card">
            <div className={`ra-stat-card__value ${compliancePassed ? "ra-stat-card__value--passed" : "ra-stat-card__value--incomplete"}`}>
              {stats.complete}/{sections.length}
            </div>
            <div className="ra-stat-card__label">Completion Status</div>
            <div className="ra-stat-card__sublabel">Sections complete</div>
          </div>
        </div>

        {/* Compliance Check Message */}
        <div className={`ra-compliance ${complianceClass}`}>
          {compliancePassed
            ? <CheckCircle className="ra-compliance__icon" aria-hidden="true" />
            : <AlertTriangle className="ra-compliance__icon" aria-hidden="true" />
          }
          <div>
            <h3 className="ra-compliance__title">
              {compliancePassed
                ? "Compliance Check Passed!"
                : "Some sections are incomplete"}
            </h3>
            <p className="ra-compliance__text">
              {compliancePassed
                ? "Your application meets all the requirements for submission. All required sections are complete and formatted correctly."
                : "Please complete all required sections before exporting your application."}
            </p>
          </div>
        </div>
      </div>

      {/* Before You Export Section */}
      <div className="ra-card">
        <h3 className="ra-export-section__title">Before You Export</h3>

        <div className="ra-export-grid">
          {/* <button
            className="ra-preview-btn"
            aria-label="Preview full application (coming soon)"
          >
            <div className="ra-preview-btn__icon-wrapper">
              <FileText className="ra-preview-btn__icon" />
            </div>
            <div className="ra-preview-btn__text">
              <div className="ra-preview-btn__title">
                Preview Full Application
              </div>
              <div className="ra-preview-btn__subtitle">
                View as a single document
              </div>
            </div>
          </button> */}

          <button
            onClick={() => onNavigate("sectionEditor")}
            className="ra-edit-btn"
            aria-label="Make final edits - return to section editor"
          >
            <div className="ra-edit-btn__icon-wrapper">
              <Edit className="ra-edit-btn__icon" aria-hidden="true" />
            </div>
            <div className="ra-edit-btn__text">
              <div className="ra-edit-btn__title">Make Final Edits</div>
              <div className="ra-edit-btn__subtitle">
                Return to section editor
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* What Happens After Export Section */}
      <div className="ra-info-section">
        <div className="ra-info-header">
          <Info className="ra-info-header__icon" aria-hidden="true" />
          <h3 className="ra-info-header__title">
            What Happens After Export?
          </h3>
        </div>
        <ul className="ra-info-list">
          <li className="ra-info-list__item">
            You&apos;ll download a professionally formatted PDF of your
            application
          </li>
          <li className="ra-info-list__item">
            Submit the PDF through the official grants.gov portal
          </li>
          <li className="ra-info-list__item">
            Complete the SF-424 form separately (if required)
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="ra-actions">
        <button
          onClick={() => onNavigate("sectionEditor")}
          className="ra-back-btn"
        >
          <ArrowLeft className="ra-back-btn__icon" aria-hidden="true" />
          Back to Editing
        </button>

        <button
          onClick={handleExportPDF}
          disabled={!compliancePassed}
          className="ra-export-pdf-btn"
        >
          <Download className="ra-export-pdf-btn__icon" aria-hidden="true" />
          Export Application as PDF
        </button>
      </div>
    </div>
  );
};

export default ReviewApplication;
