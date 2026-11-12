import React, { useState, useEffect, useMemo, useRef } from "react";
import { useApiClient } from "../../hooks/use-api-client";
import { useDocumentLibrary } from "../../hooks/use-document-library";
import { getCurrentUser } from "aws-amplify/auth";
import Card from "../../components/ui/Card";
import NavigationButtons from "../../components/ui/NavigationButtons";
import DocumentPicker from "../../components/documents/DocumentPicker";
import { colors, typography, spacing, borderRadius, transitions } from "../../components/ui/styles";
import AutoSaveIndicator from "../../components/ui/AutoSaveIndicator";
import { characterCount, MAX_INPUT_CHARS, readDraftCache, resolveQuestionnaireAnswers } from "../../common/helpers/document-editor-utils";
import { legacySelection } from "../../common/helpers/user-documents";
import type { useDraftSave } from "../../hooks/use-draft-save";
import type { DocumentData } from "../../common/types/document";
import { DailyLimitError } from "../../common/api-client/daily-limit";
import { InputTooLongError } from "../../common/api-client/drafts-client";
import { GrantInReviewError } from "../../common/api-client/grant-in-review";
import { grantSections } from "../../common/helpers/application-sections";

// Coarse phases only: the poll below updates a percentage every 2s and those
// must never reach a live region.
const DRAFT_PHASE_MESSAGES: Record<string, string> = {
  preparing: "Preparing your draft.",
  planning: "Reading the grant and your documents, and planning sections.",
  generating: "Writing your draft sections. This may take a few minutes.",
};

interface UploadDocumentsProps {
  selectedNofo: string | null;
  onNavigate: (step: string) => void;
  onNavigateToEditor?: (jobId: string) => void;
  sessionId: string;
  documentData?: DocumentData | null;
  draftSave: ReturnType<typeof useDraftSave>;
}

const UploadDocuments: React.FC<UploadDocumentsProps> = ({
  selectedNofo,
  onNavigate,
  onNavigateToEditor,
  sessionId,
  documentData,
  draftSave,
}) => {
  const apiClient = useApiClient();
  const library = useDocumentLibrary();
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const generationTitle = useRef<HTMLParagraphElement>(null);
  const [draftProgress, setDraftProgress] = useState<string>("");
  const [generationPhase, setGenerationPhase] = useState<string>("preparing");
  const [hasExistingDraft, setHasExistingDraft] = useState(false);
  // undefined until the draft loads; null for an application saved before the library.
  const [storedKeys, setStoredKeys] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const user = await getCurrentUser();
        setUserId(user.username);

        if (sessionId && user.username) {
          try {
            const draft = await apiClient.drafts.getDraft({
              sessionId,
              userId: user.username,
            });
            if (draft?.sections && Object.keys(draft.sections).length > 0) {
              setHasExistingDraft(true);
            }
            const cached = readDraftCache<string>(sessionId, "additionalInfo");
            const restored = cached ?? draft?.additionalInfo;
            if (restored) setAdditionalInfo(restored);
            setStoredKeys(draft ? draft.documentKeys ?? null : []);
          } catch {
            console.log("No existing draft found");
            setStoredKeys([]);
          }
        }
      } catch (error) {
        console.error("Error getting user:", error);
        setSubmitError("Failed to authenticate user. Please refresh the page.");
      }
    };
    fetchUserId();
  }, [apiClient, sessionId]);

  useEffect(() => {
    if (documentData?.sections && Object.keys(documentData.sections).length > 0) {
      setHasExistingDraft(true);
    }
  }, [documentData]);

  const selected = useMemo(() => {
    if (storedKeys === undefined || library.loading) return null;
    const present = new Set(library.documents.map((d) => d.key));
    // An application saved before the library keeps reading its grant's old folder until changed.
    const keys = storedKeys ?? legacySelection(library.documents, userId ?? "", selectedNofo);
    return keys.filter((k) => present.has(k));
  }, [storedKeys, library.loading, library.documents, userId, selectedNofo]);

  const changeSelection = (keys: string[]) => {
    setStoredKeys(keys);
    draftSave.saveFields({ documentKeys: keys });
  };

  const grantListsNoSections = async (nofo: string) => {
    try {
      const summary = await apiClient.landingPage.getNOFOSummary(nofo, { forApplication: true });
      return grantSections(summary?.data?.ProjectNarrativeSections).length === 0;
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!selectedNofo) return;

    try {
      setIsLoading(true);
      setSubmitError(null);

      const username = userId || (await getCurrentUser()).username;
      const draftToUse = await apiClient.drafts.getDraft({ sessionId, userId: username });

      if (!draftToUse) {
        throw new Error("Application not found. Please start a new application first.");
      }

      const documentKeys = storedKeys === undefined ? draftToUse.documentKeys ?? null : storedKeys;

      // Generation refuses a grant with no narrative sections; the applicant writes their own.
      if (await grantListsNoSections(selectedNofo)) {
        await draftSave.saveFields(
          { status: "editing_sections", additionalInfo },
          { source: "manual", immediate: true }
        );
        onNavigate("sectionEditor");
        return;
      }

      await draftSave.saveFields(
        { status: "generating_draft", additionalInfo },
        { source: "manual", immediate: true }
      );

      setGeneratingDraft(true);
      setDraftProgress("Analyzing your grant and preparing sections...");
      setGenerationPhase("preparing");
      setIsLoading(false);

      const questionnaireAnswers = await resolveQuestionnaireAnswers(
        () => apiClient.landingPage.getNOFOQuestions(selectedNofo),
        draftToUse.questionnaire,
      );

      // Start the generation job — returns jobId immediately
      const jobId = await apiClient.drafts.startDraftGeneration({
        query: "Generate all sections for the grant application",
        documentIdentifier: selectedNofo,
        projectBasics: draftToUse.projectBasics || {},
        questionnaire: draftToUse.questionnaire || {},
        questionnaireAnswers,
        additionalInfo,
        sessionId,
        documentKeys,
      });
      console.log('Draft generation job started:', jobId);
      setDraftProgress("Reading the grant and your documents, and planning sections...");
      setGenerationPhase("planning");

      let pollCount = 0;
      const maxPolls = 90;
      while (pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        pollCount++;

        try {
          const jobStatus = await apiClient.drafts.pollDraftJob(jobId);

          if (jobStatus.sectionNames && jobStatus.sectionNames.length > 0) break;

          if (jobStatus.status === 'completed' || jobStatus.status === 'partial' || jobStatus.status === 'error') break;
        } catch (err) {
          console.warn('Error polling job status:', err);
        }
      }

      // Navigate to SectionEditor — it takes over live polling
      setGeneratingDraft(false);
      if (onNavigateToEditor) {
        onNavigateToEditor(jobId);
      }
    } catch (error) {
      console.error("Error creating draft:", error);
      if (error instanceof DailyLimitError || error instanceof InputTooLongError || error instanceof GrantInReviewError) {
        void draftSave.saveFields({ status: "uploading_documents" }, { source: "status_change", immediate: true });
      }
      setSubmitError(error instanceof Error ? error.message : "Failed to create draft. Please try again.");
      setIsLoading(false);
      setGeneratingDraft(false);
      setDraftProgress("");
    }
  };

  // Rendered as the first child of both views, so React reuses the same node when
  // the view swaps: a region created together with its first message is missed.
  const draftPhaseRegion = (
    <div role="status" aria-live="polite" className="visually-hidden">
      {generatingDraft ? DRAFT_PHASE_MESSAGES[generationPhase] ?? "" : ""}
    </div>
  );

  // The form, and the Create draft button that had focus, give way to the progress view.
  useEffect(() => {
    if (generatingDraft) generationTitle.current?.focus();
  }, [generatingDraft]);

  // ── Full-page generation view ──────────────────────────────────────
  if (generatingDraft) {
    return (
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "48px 16px", fontFamily: typography.fontFamily }}>
        {draftPhaseRegion}

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            aria-hidden
            style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 20px",
              border: `3px solid ${colors.primary}`,
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <p ref={generationTitle} tabIndex={-1} style={{ fontSize: typography.fontSize["2xl"], fontWeight: typography.fontWeight.bold, color: colors.heading, margin: "0 0 8px" }}>
            Preparing sections...
          </p>
          <p style={{ fontSize: typography.fontSize.base, color: colors.textSecondary, margin: 0 }}>
            {draftProgress}
          </p>
        </div>

        {/* Indeterminate only: this view is handed off to SectionsEditor as soon
            as the section list lands, so there is never a total to measure. */}
        <div style={{ marginBottom: "32px" }}>
          <div
            role="progressbar"
            aria-label="Draft generation progress"
            aria-valuetext="Preparing sections"
            style={{
              width: "100%",
              height: "12px",
              backgroundColor: colors.border,
              borderRadius: borderRadius.full,
              overflow: "hidden",
            }}
          >
            <div
              className="gw-progress-indeterminate"
              style={{
                width: "35%",
                height: "100%",
                background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`,
                borderRadius: borderRadius.full,
                animation: "progress-slide 1.4s ease-in-out infinite",
              }}
            />
          </div>
        </div>

        {/* Persistence messaging */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "14px 18px",
            background: "var(--gw-color-background)",
            border: "1px solid var(--gw-color-success-border)",
            borderRadius: borderRadius.lg,
            fontSize: typography.fontSize.sm,
            color: "var(--gw-color-success-text)",
          }}
        >
          <span style={{ fontSize: "18px", flexShrink: 0 }} aria-hidden="true">&#10003;</span>
          <span>
            Your progress is automatically saved. You can close this page and come back anytime — your application will be here.
          </span>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes progress-slide {
            from { transform: translateX(-100%); }
            to { transform: translateX(286%); }
          }
          /* app.scss collapses all animations to one 0.01ms pass under reduced
             motion, which would park the sliding bar off-screen. */
          @media (prefers-reduced-motion: reduce) {
            .gw-progress-indeterminate {
              animation: none !important;
              transform: none !important;
              width: 100% !important;
              opacity: 0.4;
            }
          }
        `}</style>
      </div>
    );
  }

  // ── Normal form ────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "16px 0" }}>
      {draftPhaseRegion}

      <Card
        header="Additional information"
        headerActions={
          <AutoSaveIndicator
            status={draftSave.saveStatus}
            idleText={draftSave.lastSavedAt ? "Saved" : "Changes save automatically"}
            onRetry={draftSave.retry}
            variant="onPrimary"
          />
        }
      >
        <p style={{ color: colors.textSecondary, marginBottom: spacing["2xl"], fontFamily: typography.fontFamily }}>
          Choose supporting documents and share any additional context to help
          generate your grant application.
        </p>

        <div style={{ marginBottom: spacing["3xl"] }}>
          <DocumentPicker
            library={library}
            selected={selected}
            onChange={changeSelection}
            legend="Use in this application"
            description="The AI reads the documents you tick when it writes this application (e.g., organizational details, past performance reports, budgets). New uploads go to My documents."
          />
        </div>

        {/* Additional Context */}
        <div>
          <h3 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text,
            marginBottom: spacing.sm,
            fontFamily: typography.fontFamily,
          }}>
            Additional context
          </h3>
          <p id="additional-info-prompt" style={{
            fontSize: typography.fontSize.sm,
            color: colors.textSecondary,
            marginBottom: spacing.lg,
            fontFamily: typography.fontFamily,
          }}>
            Is there anything else you'd like to share about your application?
          </p>
          {/* Same words as the visible heading, so voice users can say "Additional context". */}
          <label htmlFor="additional-info" className="sr-only">
            Additional context
          </label>
          <textarea className="gw-input"
            id="additional-info"
            value={additionalInfo}
            onChange={(e) => {
              setAdditionalInfo(e.target.value);
              draftSave.saveFields({ additionalInfo: e.target.value });
            }}
            placeholder="Enter any additional context or notes about your application..."
            maxLength={MAX_INPUT_CHARS}
            aria-describedby="additional-info-prompt additional-info-help"
            style={{
              width: "100%",
              minHeight: "120px",
              resize: "vertical",
            }}
          />
          <span
            id="additional-info-help"
            style={{
              display: "block",
              fontSize: typography.fontSize.sm,
              color: colors.textSecondary,
              marginTop: spacing.xs,
              lineHeight: "1.4",
              fontFamily: typography.fontFamily,
            }}
          >
            This information will help tailor the generated draft to your needs. ({characterCount(additionalInfo)})
          </span>
        </div>

        {submitError && (
          <div
            role="alert"
            className="gw-alert gw-alert--urgent"
            style={{ marginTop: spacing.lg, whiteSpace: "pre-line" }}
          >
            {submitError}
          </div>
        )}
      </Card>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: spacing.lg,
        marginTop: spacing["2xl"],
      }}>
        <NavigationButtons
          onBack={() => onNavigate("questionnaire")}
          showContinue={false}
          justify="flex-start"
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: spacing.md, alignItems: "center" }}>
          {hasExistingDraft && (
            <button
              type="button"
              onClick={() => onNavigate("sectionEditor")}
              aria-label="Skip to Section editor"
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.sm,
                padding: `${spacing.md} ${spacing.xl}`,
                background: colors.white,
                border: `1px solid ${colors.border}`,
                borderRadius: borderRadius.md,
                color: colors.text,
                fontSize: typography.fontSize.base,
                fontWeight: typography.fontWeight.medium,
                fontFamily: typography.fontFamily,
                cursor: "pointer",
                transition: transitions.normal,
                minHeight: "44px",
              }}
            >
              Skip
            </button>
          )}
          <NavigationButtons
            showBack={false}
            onContinue={handleSubmit}
            continueLabel={
              hasExistingDraft
                ? isLoading ? "Regenerating draft…" : "Generate again"
                : isLoading ? "Creating draft…" : "Create draft"
            }
            continueDisabled={isLoading || library.uploading}
            continueLoading={isLoading}
            justify="flex-end"
          />
        </div>
      </div>
    </div>
  );
};

export default UploadDocuments;
