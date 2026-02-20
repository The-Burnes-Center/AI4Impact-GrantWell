import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useApiClient } from "../../hooks/use-api-client";
import { useAdminCheck } from "../../hooks/use-admin-check";
import {
  addToRecentlyViewed,
  getRecentlyViewed,
  cleanupRecentlyViewed,
} from "../../common/helpers/recently-viewed-nofos";
import IntegratedSearchBar from "../../components/search/IntegratedSearchBar";
import { GrantsTable } from "./GrantsTable";
import ContentBox from "./components/ContentBox";
import HistoryPanel from "./components/HistoryPanel";
import AboutPanel from "./components/AboutPanel";
import ResourcesPanel from "./components/ResourcesPanel";
import FeedbackForm from "./components/FeedbackForm";
import type { NOFO } from "../../common/types/nofo";
import type { RawNOFOData } from "../../common/types/document";
import type { RecentlyViewedNOFO } from "../../common/helpers/recently-viewed-nofos";
import "../../styles/base-page.css";
import "../../styles/landing-page.css";

interface SelectableDocument {
  label: string;
  value: string;
  status?: "active" | "archived";
}

export default function Welcome() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<SelectableDocument | null>(null);
  const [documents, setDocuments] = useState<SelectableDocument[]>([]);
  const [recentlyViewedNOFOs, setRecentlyViewedNOFOs] = useState<RecentlyViewedNOFO[]>([]);
  const [tableNofos, setTableNofos] = useState<NOFO[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightCTAButtons, setHighlightCTAButtons] = useState(false);
  const [srAnnouncement, setSrAnnouncement] = useState("");
  const [redirectMessage, setRedirectMessage] = useState<string | null>(null);
  const prevSelectedDocRef = useRef<SelectableDocument | null>(null);
  const firstCTAButtonRef = useRef<HTMLButtonElement>(null);

  const apiClient = useApiClient();
  const { isAdmin } = useAdminCheck();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Load recently viewed NOFOs
  useEffect(() => {
    setRecentlyViewedNOFOs(getRecentlyViewed());
  }, []);

  // Filter out archived NOFOs from history when documents change
  useEffect(() => {
    if (documents.length === 0) return;
    const activeNames = documents.map((doc) => doc.label);
    setRecentlyViewedNOFOs(cleanupRecentlyViewed(activeNames));
  }, [documents]);

  // Fetch NOFO documents
  useEffect(() => {
    const fetchDocuments = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.landingPage.getNOFOs();
        const folders = result.folders || [];

        if (result.nofoData) {
          const sortedNofos = [...result.nofoData].sort(
            (a: RawNOFOData, b: RawNOFOData) => {
              if (a.status === "active" && b.status !== "active") return -1;
              if (a.status !== "active" && b.status === "active") return 1;
              return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
            }
          );

          setDocuments(
            sortedNofos.map((nofo: RawNOFOData) => ({
              label: nofo.name,
              value: nofo.name + "/",
              status: nofo.status as "active" | "archived",
            }))
          );

          setTableNofos(
            sortedNofos.map((nofo: RawNOFOData, index: number) => ({
              id: index,
              name: nofo.name,
              status: nofo.status as "active" | "archived",
              isPinned: nofo.isPinned || false,
              expirationDate: nofo.expiration_date || null,
              grantType: (nofo.grant_type as NOFO["grantType"]) || null,
              agency: nofo.agency || null,
              category: nofo.category || null,
            }))
          );
        } else {
          const sortedFolders = [...folders].sort((a: string, b: string) =>
            a.localeCompare(b, undefined, { sensitivity: "base" })
          );
          setDocuments(
            sortedFolders.map((doc: string) => ({
              label: doc,
              value: doc + "/",
              status: "active" as const,
            }))
          );
          setTableNofos(
            sortedFolders.map((folder: string, index: number): NOFO => ({
              id: index, name: folder, status: "active" as const,
              isPinned: false, expirationDate: null, grantType: null,
              agency: null, category: null,
            }))
          );
        }
      } catch (err) {
        console.error("Error retrieving NOFOs:", err);
        setError("Failed to load grants. Please try refreshing the page.");
      }
      setLoading(false);
    };
    fetchDocuments();
  }, [apiClient]);

  // Check for redirect message from URL
  useEffect(() => {
    const message = searchParams.get("message");
    if (message) {
      setRedirectMessage(message);
      searchParams.delete("message");
      setSearchParams(searchParams, { replace: true });
      const timer = setTimeout(() => setRedirectMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, setSearchParams]);

  // Highlight CTA buttons on new selection
  useEffect(() => {
    if (
      selectedDocument &&
      (!prevSelectedDocRef.current ||
        prevSelectedDocRef.current.value !== selectedDocument.value)
    ) {
      setHighlightCTAButtons(true);
      setSrAnnouncement(
        `${selectedDocument.label} selected. Choose an action: View Key Requirements, Write Project Narrative, or Get Grant Help.`
      );
      const focusTimer = setTimeout(() => firstCTAButtonRef.current?.focus(), 300);
      const highlightTimer = setTimeout(() => setHighlightCTAButtons(false), 2000);
      const announcementTimer = setTimeout(() => setSrAnnouncement(""), 3000);
      prevSelectedDocRef.current = selectedDocument;
      return () => {
        clearTimeout(focusTimer);
        clearTimeout(highlightTimer);
        clearTimeout(announcementTimer);
      };
    }
    prevSelectedDocRef.current = selectedDocument;
  }, [selectedDocument]);

  const handleSelectDocument = useCallback(
    (doc: SelectableDocument | null) => setSelectedDocument(doc),
    []
  );

  const handleNOFOSelect = useCallback(
    (href: string, selectedNOFO: { label: string; value: string }) => {
      setRecentlyViewedNOFOs(addToRecentlyViewed(selectedNOFO));
      navigate(href);
    },
    [navigate]
  );

  const handleViewRequirements = useCallback(() => {
    if (!selectedDocument) return;
    handleNOFOSelect(
      `/requirements/${encodeURIComponent(selectedDocument.value)}`,
      selectedDocument
    );
  }, [selectedDocument, handleNOFOSelect]);

  const handleWriteNarrative = useCallback(() => {
    if (!selectedDocument) return;
    addToRecentlyViewed(selectedDocument);
    navigate(`/document-editor?nofo=${encodeURIComponent(selectedDocument.value)}`);
  }, [selectedDocument, navigate]);

  const handleGetHelp = useCallback(() => {
    if (!selectedDocument) return;
    addToRecentlyViewed(selectedDocument);
    const newSessionId = uuidv4();
    navigate(`/chat/${newSessionId}?folder=${encodeURIComponent(selectedDocument.value)}`);
  }, [selectedDocument, navigate]);

  return (
    <>
      <div className="landing-page">
        {/* Header */}
        <div className="landing-header">
          <div className="landing-header__logo-row">
            <img src="/images/stateseal-color.png" alt="State Seal" className="landing-header__logo" />
            <h1 className="landing-header__title">GrantWell</h1>
          </div>
          <p className="landing-header__subtitle">
            Free AI powered tool designed for finding and writing grants
          </p>
        </div>

        {/* Redirect message */}
        {redirectMessage && (
          <div className="redirect-banner" role="alert" aria-live="polite">
            <div style={{ flex: 1 }}>
              <p className="redirect-banner__text">{redirectMessage}</p>
            </div>
            <button
              onClick={() => setRedirectMessage(null)}
              className="redirect-banner__close"
              aria-label="Close message"
            >
              &times;
            </button>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="redirect-banner" role="alert" aria-live="assertive">
            <div style={{ flex: 1 }}>
              <p className="redirect-banner__text">{error}</p>
            </div>
          </div>
        )}

        {/* How it works */}
        <section aria-labelledby="how-it-works-heading" className="how-it-works">
          <h2 id="how-it-works-heading" className="how-it-works__heading">
            How it works
          </h2>
          <p className="how-it-works__text">
            Use the filters below to find grants by name, agency, or category.
            Or use the search for specific grants in the table.
            Click on any grant row to select it, then choose an action:{" "}
            <strong className="how-it-works__action-label">View Key Requirements</strong>{" "}
            to see eligibility and NOFO requirements,{" "}
            <strong className="how-it-works__action-label">Write Project Narrative</strong>{" "}
            to draft your proposal, or{" "}
            <strong className="how-it-works__action-label">Get Grant Help</strong>{" "}
            to chat with our AI assistant.
          </p>
          <div className="visually-hidden" role="note" aria-label="Screen reader navigation note">
            Screen-reader note: Use the search bar below to filter grants by name, agency, or category.
            The table shows filtered results. Use the dropdown filters to narrow by status,
            category, or grant type. Click any grant row to select it, then action buttons will appear.
            Use heading navigation to explore the content on each screen.
          </div>
        </section>

        {/* Search bar */}
        <IntegratedSearchBar
          documents={documents}
          onSelectDocument={handleSelectDocument}
          isLoading={loading}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
        />

        {/* Screen reader announcement */}
        <div role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
          {srAnnouncement}
        </div>

        {/* CTA Buttons */}
        {selectedDocument && (
          <nav
            aria-label="Grant actions"
            className={`cta-buttons-container cta-nav${highlightCTAButtons ? " highlight cta-nav--highlighted" : ""}`}
          >
            <button ref={firstCTAButtonRef} className="cta-btn" onClick={handleViewRequirements}>
              View Key Requirements
            </button>
            <button className="cta-btn" onClick={handleWriteNarrative}>
              Write Project Narrative
            </button>
            <button className="cta-btn" onClick={handleGetHelp}>
              Get Grant Help
            </button>
          </nav>
        )}

        {/* Grants Table */}
        <ContentBox backgroundColor="#ffffff">
          <section aria-labelledby="grants-table-heading" className="grants-table-section">
            <h2 id="grants-table-heading" className="visually-hidden">
              Grants Table with Filters
            </h2>
            <GrantsTable
              nofos={tableNofos}
              loading={loading}
              onSelectDocument={handleSelectDocument}
              onSearchTermChange={setSearchTerm}
              searchTerm={searchTerm}
            />
          </section>
        </ContentBox>

        {/* Admin Dashboard */}
        {isAdmin && (
          <ContentBox backgroundColor="#f0f8ff">
            <div className="admin-section">
              <div className="admin-section__content">
                <h2 className="admin-section__heading">Admin Dashboard</h2>
                <p className="admin-section__text">
                  To access the dashboard to add grants or manage users, click the button below.
                  <br />
                  <span className="admin-section__note">
                    (This section is only visible to administrators)
                  </span>
                </p>
              </div>
              <button className="admin-btn" onClick={() => navigate("/admin/dashboard")}>
                Go to Admin Dashboard
              </button>
            </div>
          </ContentBox>
        )}

        {/* About */}
        <ContentBox backgroundColor="#ffffff">
          <AboutPanel />
        </ContentBox>

        {/* Recently Viewed */}
        <ContentBox backgroundColor="#F6FCFF">
          <HistoryPanel
            recentlyViewedNOFOs={recentlyViewedNOFOs}
            onSelect={handleNOFOSelect}
          />
        </ContentBox>

        {/* Resources */}
        <ContentBox>
          <ResourcesPanel />
        </ContentBox>

        {/* Feedback */}
        <ContentBox backgroundColor="#ffffff">
          <FeedbackForm />
        </ContentBox>
      </div>

      {/* Affiliations Footer */}
      <footer>
        <div className="affiliations">
          <div className="affiliations__inner">
            <h2 className="affiliations__heading">Our Affiliations</h2>
            <div className="affiliations__logos">
              <a
                href="https://burnes.northeastern.edu/"
                target="_blank"
                rel="noopener noreferrer"
                className="affiliations__link"
                aria-label="Visit Burnes Center for Social Change at Northeastern University"
              >
                <img
                  src="/images/burnesLogo.png"
                  alt="Burnes Center for Social Change Logo"
                  className="affiliations__logo"
                />
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Fixed Feedback Tab */}
      <a
        href="#feedback-form"
        className="feedback-tab"
        onClick={(e) => {
          e.preventDefault();
          const el = document.getElementById("feedback-form");
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            setTimeout(() => {
              const firstInput = el.querySelector('input[type="radio"]') as HTMLElement;
              firstInput?.focus();
            }, 500);
          }
        }}
        aria-label="Scroll to feedback form"
      >
        <span className="feedback-tab__text">Feedback</span>
      </a>
    </>
  );
}
