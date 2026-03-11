import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useApiClient } from "../../hooks/use-api-client";
import { useAdminCheck } from "../../hooks/use-admin-check";
import { useNotifications } from "../../components/notifications/NotificationManager";
import UnifiedNavigation from "../../components/navigation/UnifiedNavigation";
import NOFOsTab from "./components/NOFOsTab";
import PaginationControls from "./components/PaginationControls";
import FeatureRolloutsTab from "./components/FeatureRolloutsTab";
import UserManagementTab from "./components/UserManagementTab";
import {
  LuSearch, LuFilter, LuMail, LuUpload, LuCheck, LuX,
  LuRefreshCw, LuDownload, LuInfo,
} from "react-icons/lu";
import { Modal } from "../../components/common/Modal";
import type { NOFO, GrantTypeId } from "../../common/types/nofo";
import type { RawNOFOData } from "../../common/types/document";
import "../../styles/dashboard.css";

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"grants" | "feature-rollouts" | "user-management">("grants");
  const [nofos, setNofos] = useState<NOFO[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [grantTypeFilter, setGrantTypeFilter] = useState<GrantTypeId | "all">("all");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [loading, setLoading] = useState(true);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState("");
  const [showGrantBanner, setShowGrantBanner] = useState(false);
  const [addedGrantName, setAddedGrantName] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [uploadNofoModalOpen, setUploadNofoModalOpen] = useState(false);
  const [inviteUserModalOpen, setInviteUserModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeConfirmModalOpen, setScrapeConfirmModalOpen] = useState(false);

  const filterMenuRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const grantsTabRef = useRef<HTMLButtonElement>(null);
  const rolloutsTabRef = useRef<HTMLButtonElement>(null);
  const userManagementTabRef = useRef<HTMLButtonElement>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const apiClient = useApiClient();
  const { isAdmin, isDeveloper, loading: roleLoading } = useAdminCheck();
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
          expirationDate: nofo.expiration_date || null,
          grantType: nofo.grant_type || null,
          agency: nofo.agency || null,
          category: nofo.category || null,
        })));
      } else {
        setNofos((nofoResult.folders || []).map((nofo: string, index: number): NOFO => ({
          id: index, name: nofo, status: "active", isPinned: false,
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

  useEffect(() => {
    if (!isAdmin) return;
    fetchNofos().then(() => setLoading(false));
  }, [isAdmin, fetchNofos]);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      setLoading(false);
    }
  }, [isAdmin, roleLoading]);

  const handleRefresh = useCallback(() => fetchNofos(true), [fetchNofos]);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const tabs = [
        { key: "grants" as const, ref: grantsTabRef },
        ...(isDeveloper
          ? [{ key: "feature-rollouts" as const, ref: rolloutsTabRef }]
          : []),
        ...(isAdmin
          ? [{ key: "user-management" as const, ref: userManagementTabRef }]
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
    [activeTab, isAdmin, isDeveloper]
  );

  const sendInvite = useCallback(async () => {
    if (!inviteEmail.trim() || !/\S+@\S+\.\S+/.test(inviteEmail)) {
      addNotification("error", "Please enter a valid email address");
      return;
    }
    try {
      await apiClient.userManagement.inviteUser(inviteEmail);
      addNotification("success", `Invitation sent successfully to ${inviteEmail}`);
      setInvitedEmail(inviteEmail);
      setShowSuccessBanner(true);
      setTimeout(() => setShowSuccessBanner(false), 5000);
      setInviteEmail("");
      setInviteUserModalOpen(false);
    } catch {
      addNotification("error", "Failed to send invitation. Please try again.");
    }
  }, [inviteEmail, apiClient, addNotification]);

  const confirmAutomatedScraper = useCallback(async () => {
    setScrapeConfirmModalOpen(false);
    try {
      setIsScraping(true);
      addNotification("info", "Starting automated NOFO scraping...");
      const response = await apiClient.landingPage.triggerAutomatedScraper();
      if (response.result && response.result.processed > 0) {
        addNotification("success", `Successfully processed ${response.result.processed} new NOFOs!`);
        await fetchNofos();
      } else {
        addNotification("info", "No new NOFOs found to process.");
      }
    } catch {
      addNotification("error", "Failed to run automated NOFO scraper. Please try again.");
    } finally {
      setIsScraping(false);
    }
  }, [apiClient, addNotification, fetchNofos]);

  const showGrantSuccessBanner = useCallback((grantName: string) => {
    setAddedGrantName(grantName);
    setShowGrantBanner(true);
    addNotification("success", `Grant "${grantName}" added successfully!`);
    setTimeout(() => setShowGrantBanner(false), 5000);
    fetchNofos();
  }, [addNotification, fetchNofos]);

  const getActiveFilterCount = useCallback(() => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (grantTypeFilter !== "all") count++;
    return count;
  }, [statusFilter, grantTypeFilter]);

  const filteredNofos = useMemo(() => {
    let filtered = nofos.filter((nofo) =>
      nofo.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (statusFilter !== "all") {
      filtered = filtered.filter((nofo) => (nofo.status || "active") === statusFilter);
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
  if (!isAdmin) return null;

  const filterCount = getActiveFilterCount();
  const activeTabAnnouncement = activeTab === "grants"
    ? "Grants tab selected"
    : activeTab === "feature-rollouts"
      ? "Developer rollouts tab selected"
      : "Developer user management tab selected";

  return (
    <div className="dashboard-shell">
      <nav aria-label="Application navigation" className="dashboard-sidebar">
        <UnifiedNavigation />
      </nav>
      <div className="dashboard-container dashboard-main-column">
        <nav aria-label="Breadcrumb" className="breadcrumb">
          <div className="breadcrumb-item">
            <button className="breadcrumb-link" onClick={() => navigate("/")}>
              Home
            </button>
          </div>
          <div className="breadcrumb-item" aria-current="page">Dashboard</div>
        </nav>

        <div className="dashboard-main-content">
          <div className="dashboard-header">
            <h1>Admin Dashboard</h1>
            <button className="action-button refresh-button" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? (
                <span className="refresh-loading">Refreshing...</span>
              ) : (
                <><LuRefreshCw size={16} className="button-icon refresh-icon" /><span>Refresh</span></>
              )}
            </button>
          </div>

          {showSuccessBanner && (
            <div className="success-banner">
              <div className="success-banner-content"><LuCheck size={20} className="success-icon" /><span>Success! An invitation has been sent to {invitedEmail}</span></div>
              <button onClick={() => setShowSuccessBanner(false)} className="banner-close-button" aria-label="Close notification"><LuX size={18} /></button>
            </div>
          )}

          {showGrantBanner && (
            <div className="success-banner">
              <div className="success-banner-content"><LuCheck size={20} className="success-icon" /><span>Success! Grant &quot;{addedGrantName}&quot; has been added</span></div>
              <button onClick={() => setShowGrantBanner(false)} className="banner-close-button" aria-label="Close notification"><LuX size={18} /></button>
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
            {isAdmin && (
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
          </div>

          <div className="dashboard-content">
            {activeTab === "grants" ? (
              <div
                id="dashboard-panel-grants"
                role="tabpanel"
                aria-labelledby="dashboard-tab-grants"
                tabIndex={0}
              >
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
                          {(["all", "federal", "state", "quasi", "philanthropic", "unknown"] as const).map((type) => (
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
                    <button className="action-button invite-button" onClick={() => setInviteUserModalOpen(true)}>
                      <LuMail size={16} className="button-icon" /><span>Invite User</span>
                    </button>
                    <button className="action-button add-button" onClick={() => setUploadNofoModalOpen(true)}>
                      <LuUpload size={16} className="button-icon" /><span>Add Grant</span>
                    </button>
                    <button className="action-button scraper-button" onClick={() => setScrapeConfirmModalOpen(true)} disabled={isScraping} aria-label="Auto-scrape NOFOs from grants.gov">
                      <LuDownload size={16} className="button-icon" /><span>{isScraping ? "Scraping..." : "Auto-Scrape NOFOs"}</span>
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
                />

                <PaginationControls
                  currentPage={currentPage}
                  totalPages={paginatedData.totalPages}
                  totalItems={paginatedData.totalItems}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(e) => { setItemsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
                />
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
            ) : (
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
                />
              </div>
            )}
          </div>
        </div>

        <Modal isOpen={inviteUserModalOpen} onClose={() => setInviteUserModalOpen(false)} title="Invite New User">
          <div className="modal-form">
            <p className="modal-description">Enter the email address of the user you want to invite. They will receive an email with instructions to set up their account.</p>
            <div className="form-group">
              <label htmlFor="invite-email">Email Address</label>
              <input type="email" id="invite-email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="form-input" placeholder="user@example.com" />
            </div>
            <div className="modal-actions">
              <button className="modal-button secondary" onClick={() => setInviteUserModalOpen(false)}>Cancel</button>
              <button className="modal-button primary" onClick={sendInvite} disabled={!inviteEmail.trim() || !/\S+@\S+\.\S+/.test(inviteEmail)}>Send Invitation</button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default Dashboard;
