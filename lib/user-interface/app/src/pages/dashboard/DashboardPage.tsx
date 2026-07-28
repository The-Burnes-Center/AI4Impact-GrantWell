import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useApiClient } from "../../hooks/use-api-client";
import { useAdminCheck } from "../../hooks/use-admin-check";
import { useNotifications } from "../../components/notifications/NotificationManager";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import NOFOsTab from "./components/NOFOsTab";
import PaginationControls from "./components/PaginationControls";
import FeatureRolloutsTab from "./components/FeatureRolloutsTab";
import UserManagementTab from "./components/UserManagementTab";
import ProcessingReviewTab from "./components/ProcessingReviewTab";
import ProcessingTab from "./components/ProcessingTab";
import DigestPreviewTab from "./components/DigestPreviewTab";
import AnalyticsTab from "./components/AnalyticsTab";
import {
  LuSearch, LuFilter, LuUpload, LuCheck, LuX,
  LuRefreshCw, LuDownload, LuInfo, LuLoader, LuArrowRight,
} from "react-icons/lu";
import { Modal } from "../../components/common/Modal";
import type { NOFO, GrantTypeId } from "../../common/types/nofo";
import type { RawNOFOData } from "../../common/types/document";
import "../../styles/dashboard.css";

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"grants" | "analytics" | "feature-rollouts" | "user-management" | "digest-preview">("grants");
   const [grantsSegment, setGrantsSegment] = useState<"all" | "processing" | "attention">("all");
  const [reviewFocus, setReviewFocus] = useState<string | null>(null);
  // Names of finished grants the admin has dismissed from the Processing tab (client-side, resets on reload).
  const [dismissedProcessing, setDismissedProcessing] = useState<Set<string>>(new Set());
  // Whether the "grants processing" pointer banner on the All-grants view is dismissed this session.
  const [processingBannerDismissed, setProcessingBannerDismissed] = useState(false);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [nofos, setNofos] = useState<NOFO[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [grantTypeFilter, setGrantTypeFilter] = useState<GrantTypeId | "all">("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [loading, setLoading] = useState(true);
  const [showGrantBanner, setShowGrantBanner] = useState(false);
  const [autoRefreshPaused, setAutoRefreshPaused] = useState(false);
  const [addedGrantName, setAddedGrantName] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [uploadNofoModalOpen, setUploadNofoModalOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeConfirmModalOpen, setScrapeConfirmModalOpen] = useState(false);

  const filterMenuRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const grantsTabRef = useRef<HTMLButtonElement>(null);
  const analyticsTabRef = useRef<HTMLButtonElement>(null);
  const rolloutsTabRef = useRef<HTMLButtonElement>(null);
  const userManagementTabRef = useRef<HTMLButtonElement>(null);
  const digestPreviewTabRef = useRef<HTMLButtonElement>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const apiClient = useApiClient();
  const { isAdmin, isDeveloper, isStateAdmin, userState, username, loading: roleLoading } = useAdminCheck();
  const canManageUsers = isAdmin;
  const { addNotification } = useNotifications();

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  // Fetch NOFOs data -- accepts a flag to indicate manual refresh
  const fetchNofos = useCallback(async (showRefreshNotification = false) => {
    try {
      setIsRefreshing(true);
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
        addNotification("success", "Dashboard refreshed successfully");
      }
    } catch {
      if (showRefreshNotification) {
        addNotification("error", "Failed to refresh dashboard data");
      }
    } finally {
      setIsRefreshing(false);
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
    const interval = setInterval(() => fetchNofos(), 10000);
    return () => clearInterval(interval);
  }, [isAdmin, hasProcessingNofos, fetchNofos, autoRefreshPaused]);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      setLoading(false);
    }
  }, [isAdmin, roleLoading]);

  const handleRefresh = useCallback(() => fetchNofos(true), [fetchNofos]);

  // Deep-link a quarantined grant's row into the review queue (stable identity so
  // it doesn't defeat NOFOsTab's memo).
  const handleOpenReview = useCallback((nofoName: string) => {
    setReviewFocus(nofoName);
    setGrantsSegment("attention");
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
        ...(isDeveloper
          ? [{ key: "digest-preview" as const, ref: digestPreviewTabRef }]
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
      addNotification("info", "Starting automated NOFO scraping...");
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
        addNotification("info", "No new or updated NOFOs found.");
      }
    } catch {
      addNotification("error", "Failed to run automated NOFO scraper. Please try again.");
    } finally {
      setIsScraping(false);
    }
  }, [apiClient, addNotification, fetchNofos]);

  const showGrantSuccessBanner = useCallback((grantName: string) => {
    // The green success banner already announces this; a toast here would double the same message.
    setAddedGrantName(grantName);
    setShowGrantBanner(true);
    setTimeout(() => setShowGrantBanner(false), 5000);
    fetchNofos();
  }, [fetchNofos]);

  const getActiveFilterCount = useCallback(() => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (grantTypeFilter !== "all") count++;
    return count;
  }, [statusFilter, grantTypeFilter]);

  const filteredNofos = useMemo(() => {
    // In-flight grants live in the "Processing" segment, not the browse list.
    let filtered = nofos.filter((nofo) =>
      !nofo.processingStatus &&
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

  useEffect(() => {
    if (currentPage > paginatedData.totalPages && paginatedData.totalPages > 0) {
      setCurrentPage(paginatedData.totalPages);
    }
  }, [currentPage, paginatedData.totalPages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuOpen && filterMenuRef.current && filterButtonRef.current &&
          !filterMenuRef.current.contains(event.target as Node) &&
          !filterButtonRef.current.contains(event.target as Node)) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterMenuOpen]);

  if (loading || roleLoading) return <div className="loading">Loading Dashboard...</div>;
  if (!isAdmin) return <Navigate to="/home" replace />;

  const filterCount = getActiveFilterCount();
  const activeTabAnnouncement = activeTab === "grants"
    ? "Grants tab selected"
    : activeTab === "analytics"
      ? "Analytics tab selected"
      : activeTab === "feature-rollouts"
        ? "Developer rollouts tab selected"
        : "Developer user management tab selected";

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
      <nav aria-label="Application navigation" style={{ flexShrink: 0 }}>
        <UnifiedNavigation />
      </nav>
      <div className="dashboard-container" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex" }}>
            <li className="breadcrumb-item">
              <button className="breadcrumb-link" onClick={() => navigate("/")}>
                Home
              </button>
            </li>
            <li className="breadcrumb-item" aria-current="page">Dashboard</li>
          </ol>
        </nav>

        <div className="dashboard-main-content">
          <div className="dashboard-header">
            <div>
              <h1>Admin Dashboard</h1>
              <p style={{ marginTop: "4px", color: "#666", fontSize: "14px" }}>
                Manage grants, users, and processing across your instance
              </p>
            </div>
            <div className="dashboard-actions">
              <button
                className="action-button refresh-button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                aria-label="Refresh dashboard"
                aria-busy={isRefreshing}
              >
                {isRefreshing ? (
                  <span className="refresh-loading">Refreshing...</span>
                ) : (
                  <><LuRefreshCw size={16} className="button-icon refresh-icon" aria-hidden="true" /><span>Refresh</span></>
                )}
              </button>
              {hasProcessingNofos && (
                <button
                  className="action-button refresh-button"
                  onClick={() => setAutoRefreshPaused((prev) => !prev)}
                  aria-pressed={autoRefreshPaused}
                >
                  {autoRefreshPaused ? "Resume auto-refresh" : "Pause auto-refresh"}
                </button>
              )}
            </div>
          </div>

          {showGrantBanner && (
            <div className="success-banner" role="status" aria-live="polite">
              <div className="success-banner-content"><LuCheck size={20} className="success-icon" aria-hidden="true" /><span>Success! Grant &quot;{addedGrantName}&quot; has been added</span></div>
              <button onClick={() => setShowGrantBanner(false)} className="banner-close-button" aria-label="Close notification"><LuX size={18} aria-hidden="true" /></button>
            </div>
          )}

          <div className="visually-hidden" aria-live="polite">
            {activeTabAnnouncement}
          </div>
          <div className="tab-controls" role="tablist" aria-label="Dashboard sections">
            <button
              id="dashboard-tab-grants"
              ref={grantsTabRef}
              className={`tab-button ${activeTab === "grants" ? "active" : ""}`}
              onClick={() => setActiveTab("grants")}
              onKeyDown={handleTabKeyDown}
              role="tab"
              aria-selected={activeTab === "grants"}
              aria-controls="dashboard-panel-grants"
              tabIndex={activeTab === "grants" ? 0 : -1}
            >
              Grants
            </button>
            {canManageUsers && (
              <button
                id="dashboard-tab-analytics"
                ref={analyticsTabRef}
                className={`tab-button ${activeTab === "analytics" ? "active" : ""}`}
                onClick={() => setActiveTab("analytics")}
                onKeyDown={handleTabKeyDown}
                role="tab"
                aria-selected={activeTab === "analytics"}
                aria-controls="dashboard-panel-analytics"
                tabIndex={activeTab === "analytics" ? 0 : -1}
              >
                Analytics
              </button>
            )}
            {isDeveloper && (
              <button
                id="dashboard-tab-rollouts"
                ref={rolloutsTabRef}
                className={`tab-button ${activeTab === "feature-rollouts" ? "active" : ""}`}
                onClick={() => setActiveTab("feature-rollouts")}
                onKeyDown={handleTabKeyDown}
                role="tab"
                aria-selected={activeTab === "feature-rollouts"}
                aria-controls="dashboard-panel-rollouts"
                tabIndex={activeTab === "feature-rollouts" ? 0 : -1}
              >
                Feature Rollouts
              </button>
            )}
            {canManageUsers && (
              <button
                id="dashboard-tab-user-management"
                ref={userManagementTabRef}
                className={`tab-button ${activeTab === "user-management" ? "active" : ""}`}
                onClick={() => setActiveTab("user-management")}
                onKeyDown={handleTabKeyDown}
                role="tab"
                aria-selected={activeTab === "user-management"}
                aria-controls="dashboard-panel-user-management"
                tabIndex={activeTab === "user-management" ? 0 : -1}
              >
                User Management
              </button>
            )}
            {isDeveloper && (
              <button
                id="dashboard-tab-digest-preview"
                ref={digestPreviewTabRef}
                className={`tab-button ${activeTab === "digest-preview" ? "active" : ""}`}
                onClick={() => setActiveTab("digest-preview")}
                onKeyDown={handleTabKeyDown}
                role="tab"
                aria-selected={activeTab === "digest-preview"}
                aria-controls="dashboard-panel-digest-preview"
                tabIndex={activeTab === "digest-preview" ? 0 : -1}
              >
                Digest Preview
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
                {isAdmin && (
                  <div className="grants-segment" role="group" aria-label="Grant view">
                    <button
                      className={`grants-segment__btn ${grantsSegment === "all" ? "grants-segment__btn--active" : ""}`}
                      onClick={() => { setGrantsSegment("all"); setReviewFocus(null); }}
                      aria-pressed={grantsSegment === "all"}
                    >
                      All grants
                    </button>
                    <button
                      className={`grants-segment__btn ${grantsSegment === "processing" ? "grants-segment__btn--active" : ""}`}
                      onClick={() => { setGrantsSegment("processing"); setReviewFocus(null); }}
                      aria-pressed={grantsSegment === "processing"}
                    >
                      Processing
                      {processingCount > 0 && (
                        <span
                          className="grants-segment__badge"
                          aria-label={`${processingCount} grants processing`}
                        >
                          <span aria-hidden="true">{processingCount > 99 ? "99+" : processingCount}</span>
                        </span>
                      )}
                    </button>
                    <button
                      className={`grants-segment__btn ${grantsSegment === "attention" ? "grants-segment__btn--active" : ""}`}
                      onClick={() => setGrantsSegment("attention")}
                      aria-pressed={grantsSegment === "attention"}
                    >
                      Needs attention
                      {pendingReviewCount > 0 && (
                        <span
                          className={`grants-segment__badge ${pendingReviewCount >= 25 ? "grants-segment__badge--high" : ""}`}
                          aria-label={`${pendingReviewCount} items need review`}
                        >
                          <span aria-hidden="true">{pendingReviewCount > 99 ? "99+" : pendingReviewCount}</span>
                        </span>
                      )}
                    </button>
                  </div>
                )}

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
                {isAdmin && !processingBannerDismissed && (processingCount > 0 || finishedCount > 0) && (
                  <div className="processing-banner" role="status">
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
                    <button
                      type="button"
                      className="processing-banner__view"
                      onClick={() => setGrantsSegment("processing")}
                    >
                      View <LuArrowRight size={13} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="processing-banner__dismiss"
                      onClick={() => setProcessingBannerDismissed(true)}
                      aria-label="Dismiss processing notice"
                    >
                      <LuX size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <div className="search-actions-container">
                  <div className="search-filter-container">
                    <div className="search-input-wrapper">
                      <LuSearch className="search-icon" size={18} />
                      <label htmlFor="grant-search" className="visually-hidden">Search grants</label>
                      <input id="grant-search" type="text" className="search-input" placeholder="Search grants..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                    </div>

                    <div className="filter-container">
                      <button ref={filterButtonRef} className={`filter-button ${filterCount > 0 ? "active" : ""}`}
                        onClick={() => setFilterMenuOpen(!filterMenuOpen)} aria-label="Filter grants" aria-expanded={filterMenuOpen} aria-haspopup="menu">
                        <LuFilter size={18} />
                        {filterCount > 0 && <span className="filter-badge" aria-label={`${filterCount} filter(s) active`}>{filterCount}</span>}
                      </button>

                      {filterMenuOpen && (
                        <div ref={filterMenuRef} className="filter-menu" role="menu">
                          <div className="filter-menu-header">Filter by Status</div>
                          {(["all", "active", "archived"] as const).map((status) => (
                            <button key={status} onClick={() => setStatusFilter(status)}
                              className={`filter-option ${statusFilter === status ? "selected" : ""}`}
                              role="menuitemradio" aria-checked={statusFilter === status}>
                              <div className="filter-option-content">
                                <span className="filter-option-check">{statusFilter === status ? "✓" : ""}</span>
                                {status === "all" ? "All Status" : status.charAt(0).toUpperCase() + status.slice(1)}
                              </div>
                            </button>
                          ))}
                          <div className="filter-menu-divider" />
                          <div className="filter-menu-header">Filter by Grant Type</div>
                          {(["all", "federal", "state", "quasi", "philanthropic"] as const).map((type) => (
                            <button key={type} onClick={() => setGrantTypeFilter(type)}
                              className={`filter-option ${grantTypeFilter === type ? "selected" : ""}`}
                              role="menuitemradio" aria-checked={grantTypeFilter === type}>
                              <div className="filter-option-content">
                                <span className="filter-option-check">{grantTypeFilter === type ? "✓" : ""}</span>
                                {type === "all" ? "All Types" : type.charAt(0).toUpperCase() + type.slice(1)}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="action-buttons">
                    <button className="action-button add-button" onClick={() => setUploadNofoModalOpen(true)}>
                      <LuUpload size={16} className="button-icon" /><span>Add Grant</span>
                    </button>
                    <button className="action-button scraper-button" onClick={() => setScrapeConfirmModalOpen(true)} disabled={isScraping} aria-label="Auto-scrape NOFOs from grants.gov" aria-busy={isScraping}>
                      <LuDownload size={16} className="button-icon" aria-hidden="true" /><span>{isScraping ? "Scraping..." : "Auto-Scrape NOFOs"}</span>
                    </button>
                  </div>
                </div>

                <Modal isOpen={scrapeConfirmModalOpen} onClose={() => setScrapeConfirmModalOpen(false)} title="Confirm Auto-Scrape">
                  <div className="modal-form">
                    <div className="delete-confirmation">
                      <LuInfo size={32} className="warning-icon dashboard-info-icon" />
                      <p>Are you sure you want to scrape NOFOs now?</p>
                    </div>
                    <p className="warning-text">This will search for new grants on grants.gov and add them to the system. This process may take a few minutes.</p>
                    <div className="modal-actions">
                      <button className="modal-button secondary" onClick={() => setScrapeConfirmModalOpen(false)}>Cancel</button>
                      <button className="modal-button primary" onClick={confirmAutomatedScraper}>Yes, Scrape Now</button>
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
                <AnalyticsTab apiClient={apiClient} addNotification={addNotification} />
              </div>
            ) : activeTab === "feature-rollouts" ? (
              <div
                id="dashboard-panel-rollouts"
                role="tabpanel"
                aria-labelledby="dashboard-tab-rollouts"
                tabIndex={0}
              >
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
                <UserManagementTab
                  apiClient={apiClient}
                  addNotification={addNotification}
                  canAssignDeveloper={isDeveloper}
                  isStateAdmin={isStateAdmin}
                  userState={userState}
                  currentUsername={username}
                />
              </div>
            ) : (
              <div
                id="dashboard-panel-digest-preview"
                role="tabpanel"
                aria-labelledby="dashboard-tab-digest-preview"
                tabIndex={0}
              >
                <DigestPreviewTab apiClient={apiClient} addNotification={addNotification} />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
