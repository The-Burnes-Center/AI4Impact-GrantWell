import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { SINGLE_STATE } from "../../common/states";
import { useNavigate, useLocation, Navigate } from "react-router";
import { useApiClient } from "../../hooks/use-api-client";
import { useAdminCheck } from "../../hooks/use-admin-check";
import { useNotifications } from "../../components/notifications/NotificationManager";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import NOFOsTab from "./components/NOFOsTab";
import PaginationControls from "../../components/common/PaginationControls";
import FeatureRolloutsTab from "./components/FeatureRolloutsTab";
import UserManagementTab from "./components/UserManagementTab";
import ProcessingReviewTab from "./components/ProcessingReviewTab";
import ProcessingTab from "./components/ProcessingTab";
import AnalyticsTab from "./components/AnalyticsTab";
import DocumentReviewsTab from "./components/DocumentReviewsTab";
import {
  LuSearch, LuUpload, LuCheck, LuX,
  LuRefreshCw, LuDownload, LuInfo, LuLoader, LuArrowRight,
} from "react-icons/lu";
import { Modal } from "../../components/common/Modal";
import PageHeader from "../../components/common/PageHeader";
import { GRANT_TYPES, type NOFO, type GrantTypeId } from "../../common/types/nofo";
import type { RawNOFOData } from "../../common/types/document";
import { LiveStatus } from "../../components/common/LiveStatus";
import "../../styles/dashboard.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import AdminTabHeader from "./components/AdminTabHeader";
import FilterSelect from "../../components/ui/FilterSelect";


const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"grants" | "analytics" | "feature-rollouts" | "user-management" | "document-reviews">("grants");
   const [grantsSegment, setGrantsSegment] = useState<"all" | "processing" | "attention">("all");
  const [reviewFocus, setReviewFocus] = useState<string | null>(null);
  // Names of finished grants the admin has dismissed from the Processing tab (client-side, resets on reload).
  const [dismissedProcessing, setDismissedProcessing] = useState<Set<string>>(new Set());
  // Whether the "grants processing" pointer banner on the All-grants view is dismissed this session.
  const [processingBannerDismissed, setProcessingBannerDismissed] = useState(false);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [nofos, setNofos] = useState<NOFO[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [grantTypeFilter, setGrantTypeFilter] = useState<GrantTypeId | "all">("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [loading, setLoading] = useState(true);
  const [showGrantBanner, setShowGrantBanner] = useState(false);
  const [autoRefreshPaused, setAutoRefreshPaused] = useState(false);
  const [addedGrantName, setAddedGrantName] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [manualRefresh, setManualRefresh] = useState(false);

  const [uploadNofoModalOpen, setUploadNofoModalOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeConfirmModalOpen, setScrapeConfirmModalOpen] = useState(false);

  const grantsTabRef = useRef<HTMLButtonElement>(null);
  const analyticsTabRef = useRef<HTMLButtonElement>(null);
  const rolloutsTabRef = useRef<HTMLButtonElement>(null);
  const userManagementTabRef = useRef<HTMLButtonElement>(null);
  const documentReviewsTabRef = useRef<HTMLButtonElement>(null);
  const tabRefs = {
    grants: grantsTabRef,
    analytics: analyticsTabRef,
    "feature-rollouts": rolloutsTabRef,
    "user-management": userManagementTabRef,
    "document-reviews": documentReviewsTabRef,
  };
  const processingSegmentRef = useRef<HTMLButtonElement>(null);
  const attentionSegmentRef = useRef<HTMLButtonElement>(null);
  const [resultsAnnouncement, setResultsAnnouncement] = useState("");
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  // Which poll-driven control holds focus, kept when it is removed so focus can be put back.
  const focusInPollControl = useRef<"pause" | "banner" | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const apiClient = useApiClient();
  const { isAdmin, isDeveloper, isStateAdmin, userState, username, loading: roleLoading } = useAdminCheck();
  // Same rule as the server's canEditAnyNofo: a state admin may scrape only on their single-state site.
  const canScrape = !isStateAdmin || Boolean(SINGLE_STATE && userState === SINGLE_STATE.code);
  const canManageUsers = isAdmin;
  const { addNotification } = useNotifications();

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  // The processing-queue email links here.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("view") === "needs-attention") setGrantsSegment("attention");
  }, [location.search]);

  // Fetch NOFOs data -- accepts a flag to indicate manual refresh. Background polls skip the
  // busy state: disabling the Refresh button under a keyboard user drops their focus to <body>.
  const fetchNofos = useCallback(async (showRefreshNotification = false, background = false) => {
    try {
      if (!background) setIsRefreshing(true);
      const nofoResult = await apiClient.landingPage.getNOFOs();

      if (nofoResult.nofoData) {
        setNofos(nofoResult.nofoData.map((nofo: RawNOFOData, index: number) => ({
          id: index,
          name: nofo.name,
          status: nofo.status || "active",
          isPinned: nofo.isPinned || false,
          isRolling: nofo.is_rolling || false,
          expirationDate: nofo.expiration_date || null,
          grantType: nofo.grant_type || null,
          scope: nofo.scope === "federal" || nofo.scope === "state" ? nofo.scope : null,
          state: nofo.state ? String(nofo.state).toUpperCase() : null,
          agency: nofo.agency || null,
          category: nofo.category || null,
          processingStatus: nofo.processing_status ?? null,
          processingCompletedAt: nofo.processing_completed_at ?? null,
          processingOutcome: nofo.processing_outcome ?? null,
          reviewFlag: nofo.review_flag
            ? {
                reason: nofo.review_flag.reason,
                missingCategories: nofo.review_flag.missingCategories ?? [],
                missingParts: nofo.review_flag.missingParts,
                flaggedAt: nofo.review_flag.flaggedAt,
              }
            : null,
        })));
      } else {
        setNofos((nofoResult.folders || []).map((nofo: string, index: number): NOFO => ({
          id: index, name: nofo, status: "active", isPinned: false, isRolling: false,
          expirationDate: null, grantType: null, agency: null, category: null,
        })));
      }

      if (showRefreshNotification) {
        addNotification("success", "Admin dashboard refreshed successfully");
      }
    } catch {
      if (showRefreshNotification) {
        addNotification("error", "Failed to refresh Admin dashboard data");
      }
    } finally {
      if (!background) setIsRefreshing(false);
    }
  }, [apiClient, addNotification]);

  const fetchPendingReviewCount = useCallback(async () => {
    try {
      const m = await apiClient.landingPage.getProcessingMetrics();
      setPendingReviewCount(m.pendingCount + m.failedCount);
    } catch {
      // Non-critical
    }
  }, [apiClient]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([fetchNofos(), fetchPendingReviewCount()]).then(() =>
      setLoading(false)
    );
  }, [isAdmin, fetchNofos, fetchPendingReviewCount]);

  // Poll for processing status when any NOFO is in progress
  const hasProcessingNofos = nofos.some((n) => n.processingStatus);

  useEffect(() => {
    if (!isAdmin || !hasProcessingNofos || autoRefreshPaused) return;
    const interval = setInterval(() => fetchNofos(false, true), 10000);
    return () => clearInterval(interval);
  }, [isAdmin, hasProcessingNofos, fetchNofos, autoRefreshPaused]);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      setLoading(false);
    }
  }, [isAdmin, roleLoading]);

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setManualRefresh(true);
    void fetchNofos(true).finally(() => setManualRefresh(false));
  }, [fetchNofos, isRefreshing]);

  // Deep-link a quarantined grant's row into the review queue (stable identity so
  // it doesn't defeat NOFOsTab's memo).
  const handleOpenReview = useCallback((nofoName: string) => {
    setReviewFocus(nofoName);
    setGrantsSegment("attention");
    // The link pressed was in the view that just closed; land on the view switch, now on Needs attention.
    requestAnimationFrame(() => attentionSegmentRef.current?.focus());
  }, []);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const tabs = [
        { key: "grants" as const, ref: grantsTabRef },
        ...(canManageUsers
          ? [{ key: "analytics" as const, ref: analyticsTabRef }]
          : []),
        ...(isDeveloper
          ? [{ key: "feature-rollouts" as const, ref: rolloutsTabRef }]
          : []),
        ...(canManageUsers
          ? [{ key: "user-management" as const, ref: userManagementTabRef }]
          : []),
        ...(canManageUsers
          ? [{ key: "document-reviews" as const, ref: documentReviewsTabRef }]
          : []),
      ];
      const currentIndex = tabs.findIndex((tab) => tab.key === activeTab);
      if (currentIndex === -1) {
        return;
      }

      const focusTabAt = (nextIndex: number) => {
        const nextTab = tabs[nextIndex];
        setActiveTab(nextTab.key);
        nextTab.ref.current?.focus();
      };

      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusTabAt((currentIndex + 1) % tabs.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusTabAt((currentIndex - 1 + tabs.length) % tabs.length);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusTabAt(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusTabAt(tabs.length - 1);
      }
    },
    [activeTab, isDeveloper, canManageUsers]
  );

  const confirmAutomatedScraper = useCallback(async () => {
    setScrapeConfirmModalOpen(false);
    try {
      setIsScraping(true);
      addNotification("info", "Starting automated grant scraping...");
      const response = await apiClient.landingPage.triggerAutomatedScraper();
      const result = response.result ?? response;
      const newCount = result.newQueued ?? result.processed ?? 0;
      const updatedCount = result.updatedQueued ?? 0;
      const total = newCount + updatedCount;
      if (total > 0) {
        const parts = [];
        if (newCount > 0) parts.push(`${newCount} new`);
        if (updatedCount > 0) parts.push(`${updatedCount} updated`);
        addNotification("success", `Queued ${parts.join(" and ")} grant${total === 1 ? "" : "s"} for processing!`);
        await fetchNofos();
      } else {
        addNotification("info", "No new or updated grants found.");
      }
    } catch {
      addNotification("error", "Failed to run automated grant scraper. Please try again.");
    } finally {
      setIsScraping(false);
    }
  }, [apiClient, addNotification, fetchNofos]);

  const showGrantSuccessBanner = useCallback((grantName: string) => {
    // The green success banner already announces this; a toast here would double the same message.
    setAddedGrantName(grantName);
    setShowGrantBanner(true);
    fetchNofos();
  }, [fetchNofos]);

  const filteredNofos = useMemo(() => {
    // In-flight new grants live in the "Processing" segment, not the browse list; a live grant
    // being reprocessed stays listed.
    let filtered = nofos.filter((nofo) =>
      (!nofo.processingStatus || nofo.status === "active" || nofo.status === "archived") &&
      nofo.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (statusFilter !== "all") {
      filtered = filtered.filter((nofo) => {
        const s = nofo.status || "active";
        if (statusFilter === "active") return s === "active";
        return s === statusFilter;
      });
    }
    if (grantTypeFilter !== "all") {
      filtered = filtered.filter((nofo) => nofo.grantType === grantTypeFilter);
    }
    filtered.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return filtered;
  }, [nofos, searchQuery, statusFilter, grantTypeFilter]);

  const RECENT_MS = 24 * 60 * 60 * 1000;
  const processingNofos = useMemo(() => {
    const now = Date.now();
    return nofos.filter((n) => {
      if (n.processingStatus && n.processingStatus !== "quarantined") return true;
      if (!n.processingCompletedAt) return false;
      // A dismissed finished card stays hidden until the next reload (client-side only; the
      // completion stamp itself persists on the record for the full 24h window).
      if (dismissedProcessing.has(n.name)) return false;
      const finished = new Date(n.processingCompletedAt).getTime();
      return !isNaN(finished) && now - finished <= RECENT_MS;
    });
  }, [nofos, RECENT_MS, dismissedProcessing]);

  // Badge counts only actively-processing grants (recently-finished are informational, not "todo").
  const processingCount = useMemo(
    () => nofos.filter((n) => n.processingStatus && n.processingStatus !== "quarantined").length,
    [nofos]
  );
  // Recently-finished (not dismissed) count, for the pointer banner on the All-grants view.
  const finishedCount = useMemo(
    () =>
      processingNofos.filter((n) => !n.processingStatus && n.processingCompletedAt).length,
    [processingNofos]
  );

  // Re-show a dismissed pointer banner when a fresh batch starts processing, so dismissing it once
  // doesn't hide progress for later uploads. Tracks the previous in-flight count via a ref.
  const prevProcessingCount = useRef(0);
  useEffect(() => {
    if (processingCount > prevProcessingCount.current) {
      setProcessingBannerDismissed(false);
    }
    prevProcessingCount.current = processingCount;
  }, [processingCount]);

  const processingBannerShown =
    activeTab === "grants" && grantsSegment === "all" && isAdmin && !processingBannerDismissed &&
    (processingCount > 0 || finishedCount > 0);

  const trackPollControlFocus = useCallback((key: "pause" | "banner") => ({
    onFocus: () => { focusInPollControl.current = key; },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      const control = event.currentTarget;
      if (event.relatedTarget) {
        focusInPollControl.current = null;
        return;
      }
      setTimeout(() => {
        const movedOff = control.isConnected && document.activeElement !== control;
        if (focusInPollControl.current === key && movedOff) focusInPollControl.current = null;
      }, 0);
    },
  }), []);

  useLayoutEffect(() => {
    const lost = focusInPollControl.current;
    if ((lost === "pause" && !hasProcessingNofos) || (lost === "banner" && !processingBannerShown)) {
      focusInPollControl.current = null;
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      if (lost === "pause") refreshButtonRef.current?.focus();
      else document.getElementById("grant-search")?.focus();
    }
  }, [hasProcessingNofos, processingBannerShown]);

  const paginatedData = useMemo(() => {
    const totalPages = Math.ceil(filteredNofos.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    return {
      items: filteredNofos.slice(startIndex, startIndex + itemsPerPage),
      totalItems: filteredNofos.length,
      totalPages,
    };
  }, [filteredNofos, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, grantTypeFilter, searchQuery]);

  // Announce the match count once typing or filtering settles, not on first render or on polls.
  const filteredCount = useRef(0);
  filteredCount.current = filteredNofos.length;
  const filtersTouched = useRef(false);
  useEffect(() => {
    if (!filtersTouched.current) {
      filtersTouched.current = true;
      return;
    }
    const timer = setTimeout(() => {
      const n = filteredCount.current;
      setResultsAnnouncement(`${n} grant${n === 1 ? "" : "s"} found`);
    }, 500);
    return () => clearTimeout(timer);
  }, [statusFilter, grantTypeFilter, searchQuery]);

  useEffect(() => {
    if (currentPage > paginatedData.totalPages && paginatedData.totalPages > 0) {
      setCurrentPage(paginatedData.totalPages);
    }
  }, [currentPage, paginatedData.totalPages]);


  if (loading || roleLoading) return <LoadingSpinner message="Loading Admin dashboard…" showMessage />;
  if (!isAdmin) return <Navigate to="/home" replace />;


  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      <UnifiedNavigation />
      <div className="dashboard-container" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="dashboard-main-content">
          <PageHeader
            title="Admin dashboard"
            intro="Manage grants, users, and processing across your instance"
            actions={
              <>
                <button
                  ref={refreshButtonRef}
                  className="gw-btn gw-btn--secondary action-button refresh-button"
                  onClick={handleRefresh}
                  aria-disabled={isRefreshing}
                  aria-busy={isRefreshing}
                >
                  {isRefreshing ? (
                    <span className="refresh-loading">Refreshing...</span>
                  ) : (
                    <><LuRefreshCw size={16} className="button-icon refresh-icon" aria-hidden="true" /><span>Refresh</span></>
                  )}
                  <span className="visually-hidden"> Admin dashboard</span>
                </button>
                {hasProcessingNofos && (
                  <button
                    className="gw-btn gw-btn--secondary action-button refresh-button"
                    onClick={() => setAutoRefreshPaused((prev) => !prev)}
                    {...trackPollControlFocus("pause")}
                  >
                    {autoRefreshPaused ? "Resume auto-refresh" : "Pause auto-refresh"}
                  </button>
                )}
              </>
            }
          />

          <LiveStatus className="visually-hidden">{manualRefresh ? "Refreshing Admin dashboard" : null}</LiveStatus>
          <div role="status" aria-live="polite" className="visually-hidden">
            {showGrantBanner ? `Success! Grant "${addedGrantName}" has been added` : ""}
          </div>
          {showGrantBanner && (
            <div className="gw-alert gw-alert--success success-banner">
              <div className="success-banner-content"><LuCheck size={20} className="success-icon" aria-hidden="true" /><span>Success! Grant &quot;{addedGrantName}&quot; has been added</span></div>
              <button
                onClick={() => {
                  setShowGrantBanner(false);
                  tabRefs[activeTab].current?.focus();
                }}
                className="gw-btn gw-btn--icon gw-btn--slim banner-close-button"
                aria-label="Close notification"
              ><LuX size={18} aria-hidden="true" /></button>
            </div>
          )}

          <div className="gw-tabs tab-controls" role="tablist" aria-label="Admin dashboard sections">
            <button
              id="dashboard-tab-grants"
              ref={grantsTabRef}
              className={`gw-tab tab-button ${activeTab === "grants" ? "active" : ""}`}
              onClick={() => setActiveTab("grants")}
              onKeyDown={handleTabKeyDown}
              role="tab"
              aria-selected={activeTab === "grants"}
              aria-controls={activeTab === "grants" ? "dashboard-panel-grants" : undefined}
              tabIndex={activeTab === "grants" ? 0 : -1}
            >
              Grants
            </button>
            {canManageUsers && (
              <button
                id="dashboard-tab-analytics"
                ref={analyticsTabRef}
                className={`gw-tab tab-button ${activeTab === "analytics" ? "active" : ""}`}
                onClick={() => setActiveTab("analytics")}
                onKeyDown={handleTabKeyDown}
                role="tab"
                aria-selected={activeTab === "analytics"}
                aria-controls={activeTab === "analytics" ? "dashboard-panel-analytics" : undefined}
                tabIndex={activeTab === "analytics" ? 0 : -1}
              >
                Analytics
              </button>
            )}
            {isDeveloper && (
              <button
                id="dashboard-tab-rollouts"
                ref={rolloutsTabRef}
                className={`gw-tab tab-button ${activeTab === "feature-rollouts" ? "active" : ""}`}
                onClick={() => setActiveTab("feature-rollouts")}
                onKeyDown={handleTabKeyDown}
                role="tab"
                aria-selected={activeTab === "feature-rollouts"}
                aria-controls={activeTab === "feature-rollouts" ? "dashboard-panel-rollouts" : undefined}
                tabIndex={activeTab === "feature-rollouts" ? 0 : -1}
              >
                Feature rollouts
              </button>
            )}
            {canManageUsers && (
              <button
                id="dashboard-tab-user-management"
                ref={userManagementTabRef}
                className={`gw-tab tab-button ${activeTab === "user-management" ? "active" : ""}`}
                onClick={() => setActiveTab("user-management")}
                onKeyDown={handleTabKeyDown}
                role="tab"
                aria-selected={activeTab === "user-management"}
                aria-controls={activeTab === "user-management" ? "dashboard-panel-user-management" : undefined}
                tabIndex={activeTab === "user-management" ? 0 : -1}
              >
                User management
              </button>
            )}
            {canManageUsers && (
              <button
                id="dashboard-tab-document-reviews"
                ref={documentReviewsTabRef}
                className={`gw-tab tab-button ${activeTab === "document-reviews" ? "active" : ""}`}
                onClick={() => setActiveTab("document-reviews")}
                onKeyDown={handleTabKeyDown}
                role="tab"
                aria-selected={activeTab === "document-reviews"}
                aria-controls={activeTab === "document-reviews" ? "dashboard-panel-document-reviews" : undefined}
                tabIndex={activeTab === "document-reviews" ? 0 : -1}
              >
                Document reviews
              </button>
            )}
          </div>

          <div className="dashboard-content">
            {activeTab === "grants" ? (
              <div
                id="dashboard-panel-grants"
                role="tabpanel"
                aria-labelledby="dashboard-tab-grants"
                tabIndex={0}
              >
                <AdminTabHeader title="Grants" intro="Every grant on the site, with its status and processing state." />
                {isAdmin && (
                  <div className="gw-toggle grants-segment" role="group" aria-label="Grant view">
                    <button
                      className={`gw-toggle__option grants-segment__btn ${grantsSegment === "all" ? "grants-segment__btn--active" : ""}`}
                      onClick={() => { setGrantsSegment("all"); setReviewFocus(null); }}
                      aria-pressed={grantsSegment === "all"}
                    >
                      All grants
                    </button>
                    <button
                      ref={processingSegmentRef}
                      className={`gw-toggle__option grants-segment__btn ${grantsSegment === "processing" ? "grants-segment__btn--active" : ""}`}
                      onClick={() => { setGrantsSegment("processing"); setReviewFocus(null); }}
                      aria-pressed={grantsSegment === "processing"}
                    >
                      Processing
                      {processingCount > 0 && (
                        <span className="grants-segment__badge">
                          <span className="visually-hidden">, </span>
                          {processingCount > 99 ? "99+" : processingCount}
                          <span className="visually-hidden"> {processingCount === 1 ? "grant" : "grants"}</span>
                        </span>
                      )}
                    </button>
                    <button
                      ref={attentionSegmentRef}
                      className={`gw-toggle__option grants-segment__btn ${grantsSegment === "attention" ? "grants-segment__btn--active" : ""}`}
                      onClick={() => setGrantsSegment("attention")}
                      aria-pressed={grantsSegment === "attention"}
                    >
                      Needs attention
                      {pendingReviewCount > 0 && (
                        <span className={`grants-segment__badge ${pendingReviewCount >= 25 ? "grants-segment__badge--high" : ""}`}>
                          <span className="visually-hidden">, </span>
                          {pendingReviewCount > 99 ? "99+" : pendingReviewCount}
                          <span className="visually-hidden"> {pendingReviewCount === 1 ? "item" : "items"}</span>
                        </span>
                      )}
                    </button>
                  </div>
                )}

                <h3 className="visually-hidden">
                  {grantsSegment === "attention" ? "Needs attention" : grantsSegment === "processing" ? "Processing" : "All grants"}
                </h3>
                <div role="status" className="visually-hidden">
                  {grantsSegment === "all" ? resultsAnnouncement : ""}
                </div>

                {isAdmin && grantsSegment === "attention" ? (
                  <ProcessingReviewTab
                    apiClient={apiClient}
                    addNotification={addNotification}
                    focusNofo={reviewFocus}
                  />
                ) : isAdmin && grantsSegment === "processing" ? (
                  <ProcessingTab
                    nofos={processingNofos}
                    onViewSummary={(name) => navigate(`/requirements/${encodeURIComponent(name)}`)}
                    onOpenReview={handleOpenReview}
                    onDismiss={(name) =>
                      setDismissedProcessing((prev) => new Set(prev).add(name))
                    }
                  />
                ) : (
                <>
                {/* Always in the page, so a banner that appears with its text is still announced. */}
                <LiveStatus className="visually-hidden">
                  {isAdmin && !processingBannerDismissed && (processingCount > 0 || finishedCount > 0)
                    ? [
                        processingCount > 0 && `${processingCount} grant${processingCount === 1 ? "" : "s"} processing`,
                        finishedCount > 0 && `${finishedCount} recently finished`,
                      ].filter(Boolean).join(", ")
                    : null}
                </LiveStatus>
                {processingBannerShown && (
                  <div className="gw-alert gw-alert--info processing-banner">
                    <div className="processing-banner__message">
                      {processingCount > 0 ? (
                        <LuLoader size={16} className="processing-banner__spin" aria-hidden="true" />
                      ) : (
                        <LuCheck size={16} aria-hidden="true" />
                      )}
                      <span className="processing-banner__text">
                        {processingCount > 0 && `${processingCount} grant${processingCount === 1 ? "" : "s"} processing`}
                        {processingCount > 0 && finishedCount > 0 && " · "}
                        {finishedCount > 0 && `${finishedCount} recently finished`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="processing-banner__view"
                      {...trackPollControlFocus("banner")}
                      onClick={() => {
                        setGrantsSegment("processing");
                        processingSegmentRef.current?.focus();
                      }}
                    >
                      View <LuArrowRight size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="processing-banner__dismiss"
                      {...trackPollControlFocus("banner")}
                      onClick={() => {
                        setProcessingBannerDismissed(true);
                        document.getElementById("grant-search")?.focus();
                      }}
                      aria-label="Dismiss processing notice"
                    >
                      <LuX size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <div className="search-actions-container">
                  <div className="gw-filters admin-grant-filters">
                    <div className="gw-filter admin-grant-filters__search">
                      <label htmlFor="grant-search" className="gw-filter__label">Search grants</label>
                      <div className="search-input-wrapper">
                        <LuSearch className="search-icon" size={18} aria-hidden="true" />
                        <input id="grant-search" type="text" className="gw-input search-input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                      </div>
                    </div>
                    <FilterSelect<"all" | "active" | "archived">
                      id="admin-status-filter"
                      label="Status"
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={[
                        { value: "all", label: "All statuses" },
                        { value: "active", label: "Active" },
                        { value: "archived", label: "Archived" },
                      ]}
                    />
                    <FilterSelect<GrantTypeId | "all">
                      id="admin-grant-type-filter"
                      label="Grant type"
                      value={grantTypeFilter}
                      onChange={setGrantTypeFilter}
                      options={[
                        { value: "all", label: "All grant types" },
                        ...(Object.keys(GRANT_TYPES) as GrantTypeId[]).map((type) => ({ value: type, label: GRANT_TYPES[type].label })),
                      ]}
                    />
                  </div>

                  <div className="action-buttons">
                    <button className="gw-btn gw-btn--primary action-button add-button" onClick={() => setUploadNofoModalOpen(true)}>
                      <LuUpload size={16} className="button-icon" aria-hidden="true" /><span>Add grant</span>
                    </button>
                    {canScrape && (
                      <button className="gw-btn gw-btn--secondary action-button scraper-button" onClick={() => !isScraping && setScrapeConfirmModalOpen(true)} aria-disabled={isScraping} aria-busy={isScraping}>
                        <LuDownload size={16} className="button-icon" aria-hidden="true" /><span>{isScraping ? "Scraping..." : "Auto-scrape grants"}</span><span className="visually-hidden"> from grants.gov</span>
                      </button>
                    )}
                  </div>
                </div>

                <Modal isOpen={scrapeConfirmModalOpen} onClose={() => setScrapeConfirmModalOpen(false)} title="Confirm auto-scrape">
                  <div className="modal-form">
                    <div className="delete-confirmation">
                      <LuInfo size={32} className="warning-icon dashboard-info-icon" aria-hidden="true" />
                      <p>Are you sure you want to scrape grants now?</p>
                    </div>
                    <p className="warning-text">This will search for new grants on grants.gov and add them to the system. This process may take a few minutes.</p>
                    <div className="modal-actions">
                      <button className="gw-btn gw-btn--secondary modal-button secondary" onClick={() => setScrapeConfirmModalOpen(false)}>Cancel</button>
                      <button className="gw-btn gw-btn--primary modal-button primary" onClick={confirmAutomatedScraper}>Yes, scrape now</button>
                    </div>
                  </div>
                </Modal>

                <NOFOsTab
                  nofos={paginatedData.items}
                  searchQuery={searchQuery}
                  apiClient={apiClient}
                  updateNofos={(updater) => setNofos(updater)}
                  uploadNofoModalOpen={uploadNofoModalOpen}
                  setUploadNofoModalOpen={setUploadNofoModalOpen}
                  showGrantSuccessBanner={showGrantSuccessBanner}
                  addNotification={addNotification}
                  onOpenReview={handleOpenReview}
                  isStateAdmin={isStateAdmin}
                  userState={userState}
                />

                <PaginationControls
                  currentPage={currentPage}
                  totalPages={paginatedData.totalPages}
                  totalItems={paginatedData.totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(e) => { setItemsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
                />
                </>
                )}
              </div>
            ) : activeTab === "analytics" ? (
              <div
                id="dashboard-panel-analytics"
                role="tabpanel"
                aria-labelledby="dashboard-tab-analytics"
                tabIndex={0}
              >
                <AdminTabHeader
                  title="Analytics"
                  intro="How people use the site: accounts, applications, departments and reported outcomes."
                />
                <AnalyticsTab
                  apiClient={apiClient}
                  addNotification={addNotification}
                  isStateAdmin={isStateAdmin}
                  userState={userState}
                />
              </div>
            ) : activeTab === "feature-rollouts" ? (
              <div
                id="dashboard-panel-rollouts"
                role="tabpanel"
                aria-labelledby="dashboard-tab-rollouts"
                tabIndex={0}
              >
                <AdminTabHeader
                  title="Feature rollouts"
                  intro="Take the site offline for maintenance, and choose who sees features that are still in testing."
                />
                <FeatureRolloutsTab
                  apiClient={apiClient}
                  addNotification={addNotification}
                />
              </div>
            ) : activeTab === "user-management" ? (
              <div
                id="dashboard-panel-user-management"
                role="tabpanel"
                aria-labelledby="dashboard-tab-user-management"
                tabIndex={0}
              >
                <AdminTabHeader
                  title="User management"
                  intro={
                    isStateAdmin
                      ? `Invite people in ${userState}, change their roles and remove their accounts.`
                      : "Invite people, change their roles and remove their accounts."
                  }
                />
                <UserManagementTab
                  apiClient={apiClient}
                  addNotification={addNotification}
                  canAssignDeveloper={isDeveloper}
                  isStateAdmin={isStateAdmin}
                  userState={userState}
                  currentUsername={username}
                />
              </div>
            ) : activeTab === "document-reviews" ? (
              <div
                id="dashboard-panel-document-reviews"
                role="tabpanel"
                aria-labelledby="dashboard-tab-document-reviews"
                tabIndex={0}
              >
                <AdminTabHeader
                  title="Document reviews"
                  intro={
                    isStateAdmin
                      ? `Requests from people in ${userState} to use a document the check found unrelated to a grant.`
                      : "Requests to use a document the check found unrelated to a grant."
                  }
                />
                <DocumentReviewsTab apiClient={apiClient} />
              </div>
            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
