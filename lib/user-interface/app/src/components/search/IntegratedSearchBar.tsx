import React, { useState, useEffect, useRef, useContext } from "react";
import { Spinner } from "@cloudscape-design/components";
import useGrantRecommendations from "../../hooks/useGrantRecommendations";
import { GrantRecommendation } from "../../hooks/useGrantRecommendations";
import { Auth } from "aws-amplify";
import { LuPin } from "react-icons/lu";
import { LuPinOff } from "react-icons/lu";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { GrantTypeId } from "../../common/grant-types";

// Grant type definitions for display (matching Dashboard pattern)
const GRANT_TYPES: Record<GrantTypeId, { label: string; color: string }> = {
  federal: { label: "Federal", color: "#1a4480" },
  state: { label: "State", color: "#2e8540" },
  quasi: { label: "Quasi", color: "#8168b3" },
  philanthropic: { label: "Philanthropic", color: "#e66f0e" },
  unknown: { label: "Unknown", color: "#6b7280" },
};

interface PinnableGrant extends GrantRecommendation {
  isPinned: boolean;
  grantType?: GrantTypeId | null;
}

interface IntegratedSearchBarProps {
  documents: { label: string; value: string }[];
  onSelectDocument: (document: { label: string; value: string }) => void;
  isLoading: boolean;
}

const IntegratedSearchBar: React.FC<IntegratedSearchBarProps> = ({
  documents,
  onSelectDocument,
  isLoading,
}) => {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [searchTerm, setSearchTerm] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [filteredDocuments, setFilteredDocuments] = useState(documents);
  const [pinnedGrants, setPinnedGrants] = useState<PinnableGrant[]>([]);
  const [filteredPinnedGrants, setFilteredPinnedGrants] = useState<
    PinnableGrant[]
  >([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [recommendedGrants, setRecommendedGrants] = useState<
    GrantRecommendation[]
  >([]);
  const [isAISearching, setIsAISearching] = useState(false);
  const [showViewAllModal, setShowViewAllModal] = useState(false);
  const [aiSearchTriggered, setAiSearchTriggered] = useState(false);
  const [lastAIQuery, setLastAIQuery] = useState("");

  // Ref for debounce timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // State for rotating loading messages
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const loadingMessages = [
    "Searching through grant database...",
    "Analyzing your requirements...",
    "Matching grants to your needs...",
    "Reviewing eligibility criteria...",
    "Finding the best matches...",
    "Processing grant information...",
    "Comparing funding opportunities...",
    "Evaluating grant parameters...",
  ];

  // Ref for View All Grants modal focus trap
  const viewAllModalRef = useRef<HTMLDivElement>(null);
  const viewAllModalPreviousFocusRef = useRef<HTMLElement | null>(null);

  // Use grant recommendations hook only for the Grant Assistant
  const {
    loading: recommendationsLoading,
    recommendations,
    getRecommendationsUsingREST,
  } = useGrantRecommendations();

  const [expandedGrants, setExpandedGrants] = useState<Record<string, boolean>>(
    {}
  );

  // Grant type mapping: grant name -> grant type
  const [grantTypeMap, setGrantTypeMap] = useState<
    Record<string, GrantTypeId | null>
  >({});

  // Add state for 'How to use?' modal
  const [showHowToModal, setShowHowToModal] = useState(false);
  const howToRef = useRef<HTMLDivElement>(null);

  // Check if user is admin
  const checkUserIsAdmin = async () => {
    try {
      const user = await Auth.currentAuthenticatedUser();
      const userRole = user?.signInUserSession?.idToken?.payload["custom:role"];
      return userRole && userRole.includes("Admin");
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  };

  // Check admin permissions on component mount
  useEffect(() => {
    const checkAdmin = async () => {
      const adminStatus = await checkUserIsAdmin();
      setIsAdmin(adminStatus);
    };

    checkAdmin();
  }, []);

  // Load pinned grants and grant type mapping from API on component mount
  useEffect(() => {
    const loadPinnedGrants = async () => {
      try {
        const result = await apiClient.landingPage.getNOFOs();
        if (result.nofoData) {
          // Create grant type mapping for all grants
          const typeMap: Record<string, GrantTypeId | null> = {};
          result.nofoData.forEach((nofo) => {
            typeMap[nofo.name] = nofo.grant_type || null;
          });
          setGrantTypeMap(typeMap);

          // Load pinned grants with grant type
          const pinnedGrants = result.nofoData
            .filter((nofo) => nofo.isPinned)
            .map((nofo) => ({
              id: nofo.name,
              name: nofo.name,
              isPinned: true,
              grantType: nofo.grant_type || null,
              matchScore: 80,
              eligibilityMatch: true,
              matchReason: "Admin selected",
              fundingAmount: "Varies",
              deadline: "See details",
              keyRequirements: [],
              summaryUrl: `${nofo.name}/`,
            }))
            .sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
            );
          setPinnedGrants(pinnedGrants);
        }
      } catch (error) {
        console.error("Error loading pinned grants:", error);
      }
    };

    loadPinnedGrants();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Focus trap and focus restoration for View All Grants modal
  useEffect(() => {
    if (!showViewAllModal) return;

    // Store the currently focused element
    viewAllModalPreviousFocusRef.current =
      document.activeElement as HTMLElement;

    // Focus the modal after a short delay
    setTimeout(() => {
      const firstFocusable =
        viewAllModalRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
      firstFocusable?.focus();
    }, 100);

    // Restore focus when modal closes
    return () => {
      // Only restore focus if the element still exists in the DOM
      if (
        viewAllModalPreviousFocusRef.current &&
        document.body.contains(viewAllModalPreviousFocusRef.current)
      ) {
        viewAllModalPreviousFocusRef.current.focus();
      }
    };
  }, [showViewAllModal]);

  // Focus trap handler for View All Grants modal
  useEffect(() => {
    if (!showViewAllModal || !viewAllModalRef.current) return;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusableElements =
        viewAllModalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Check if currently focused element is inside the modal
      const activeElement = document.activeElement as HTMLElement;
      const isInsideModal = viewAllModalRef.current?.contains(activeElement);

      // If focus is outside the modal, bring it back
      if (!isInsideModal) {
        e.preventDefault();
        firstElement.focus();
        return;
      }

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleTabKey);
    return () => document.removeEventListener("keydown", handleTabKey);
  }, [showViewAllModal, documents, pinnedGrants]); // Re-run when grants change

  // Rotate loading messages while AI is searching
  useEffect(() => {
    if (!isAISearching) {
      setLoadingMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2000); // Change message every 2 seconds

    return () => clearInterval(interval);
  }, [isAISearching, loadingMessages.length]);

  // Clear AI suggestions when search term changes (especially on backspace)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (searchTerm.length < 3) {
      if (recommendedGrants.length > 0 || aiSearchTriggered || isAISearching) {
        setIsAISearching(false);
        resetAISearch();
      }
    } else if (lastAIQuery && searchTerm !== lastAIQuery) {
      if (searchTerm.length < lastAIQuery.length) {
        setIsAISearching(false);
        resetAISearch();
      }
    }
  }, [searchTerm]);

  // Debounced AI search - triggers after user stops typing for 1 second
  useEffect(() => {
    // Clear any existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const hasExactMatches = filteredDocuments.length > 0 || filteredPinnedGrants.length > 0;
    const looksLikeQuery = searchTerm.includes(" ") && searchTerm.length > 10;
    const shouldTriggerAI = searchTerm.length >= 3 && 
                            (!hasExactMatches || looksLikeQuery) && 
                            !isAISearching &&
                            searchTerm !== lastAIQuery;

    if (shouldTriggerAI && showResults) {
      debounceTimerRef.current = setTimeout(() => {
        triggerAISearch(searchTerm);
      }, 1200); // 1.2 second debounce
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm, filteredDocuments.length, filteredPinnedGrants.length, showResults]);

  // Trigger AI search function
  const triggerAISearch = async (query: string) => {
    if (!query.trim() || isAISearching) return;

    setIsAISearching(true);
    setAiSearchTriggered(true);
    setLastAIQuery(query);
    setExpandedGrants({});

    try {
      const response = await getRecommendationsUsingREST(query);
      if (response && response.grants) {
        setRecommendedGrants(response.grants);
      } else {
        setRecommendedGrants([]);
      }
    } catch (error) {
      console.error("Error getting AI recommendations:", error);
      setRecommendedGrants([]);
    } finally {
      setIsAISearching(false);
    }
  };

  // Filter documents when search term changes - removed automatic AI recommendations
  useEffect(() => {
    // Filter existing documents and sort alphabetically
    const filtered = documents
      .filter((doc) =>
        doc.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
      );
    setFilteredDocuments(filtered);

    // Filter pinned grants and sort alphabetically
    const filteredPinned = pinnedGrants
      .filter((grant) =>
        grant.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
    setFilteredPinnedGrants(filteredPinned);

    // Reset selectedIndex when results change
    setSelectedIndex(-1);
  }, [searchTerm, documents, pinnedGrants]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const pinnedCount = filteredPinnedGrants.length;
    const aiCount = recommendedGrants.length;
    const availableCount = filteredDocuments.length;
    const totalItems = pinnedCount + aiCount + availableCount;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0) {
        // Select the highlighted item
        if (selectedIndex < pinnedCount) {
          // Pinned grant
          handlePinnedGrantSelect(filteredPinnedGrants[selectedIndex]);
        } else if (selectedIndex < pinnedCount + aiCount) {
          // AI suggestion
          const aiIndex = selectedIndex - pinnedCount;
          const grant = recommendedGrants[aiIndex];
          handleAIGrantSelect(grant.summaryUrl, grant.name || "");
        } else {
          // Available grant
          const docIndex = selectedIndex - pinnedCount - aiCount;
          onSelectDocument(filteredDocuments[docIndex]);
        }
        setShowResults(false);
      } else if (searchTerm.trim().length >= 3) {
        // No item selected - trigger AI search immediately
        triggerAISearch(searchTerm);
      }
    } else if (e.key === "Escape") {
      setShowResults(false);
    }
  };

  // Handle selecting a pinned grant
  const handlePinnedGrantSelect = (grant: PinnableGrant) => {
    // Set the search term
    setSearchTerm(grant.name);

    // Find the matching document if needed for further processing
    const matchedDoc = documents.find((doc) => doc.label === grant.name);
    if (matchedDoc) {
      onSelectDocument(matchedDoc);
    }

    // Close the dropdown
    setShowResults(false);
  };


  // Handle selection of an AI-recommended grant
  const handleAIGrantSelect = (summaryUrl: string, grantName: string) => {
    setSearchTerm(grantName);

    // Find the matching document for onSelectDocument
    const matchedDoc = documents.find((doc) => doc.value === summaryUrl);
    if (matchedDoc) {
      onSelectDocument(matchedDoc);
    }

    setShowResults(false); // Close the dropdown
  };

  // Reset AI search state
  const resetAISearch = () => {
    setRecommendedGrants([]);
    setAiSearchTriggered(false);
    setLastAIQuery("");
  };

  // Helper function to render grant type badge
  const renderGrantTypeBadge = (grantType: GrantTypeId | null | undefined) => {
    if (!grantType || !GRANT_TYPES[grantType]) {
      return null;
    }

    const typeInfo = GRANT_TYPES[grantType];
    return (
      <span
        style={{
          display: "inline-block",
          fontSize: "11px",
          fontWeight: "500",
          padding: "2px 8px",
          borderRadius: "12px",
          backgroundColor: `${typeInfo.color}15`,
          color: typeInfo.color,
          border: `1px solid ${typeInfo.color}40`,
          whiteSpace: "nowrap",
        }}
      >
        {typeInfo.label}
      </span>
    );
  };

  const assistantContainerStyle: React.CSSProperties = {
    backgroundColor: "#fff",
    borderRadius: "0 0 15px 15px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.15)",
    padding: "16px",
    maxHeight: "600px",
    display: "flex",
    flexDirection: "column",
  };

  const assistantHeaderStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 0 16px 0",
    borderBottom: "1px solid #e0e0e0",
  };

  const assistantCloseButtonStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#555",
    fontSize: "20px",
    padding: "4px 8px",
  };

  const assistantInputContainerStyle: React.CSSProperties = {
    display: "flex",
    padding: "16px 0",
    borderBottom: "1px solid #e0e0e0",
  };

  const assistantInputStyle: React.CSSProperties = {
    flex: 1,
    padding: "10px 16px",
    borderRadius: "20px",
    border: "1px solid #e0e0e0",
    fontSize: "14px",
  };

  const assistantSubmitButtonStyle: React.CSSProperties = {
    backgroundColor: "#14558F",
    color: "white",
    border: "none",
    borderRadius: "20px",
    padding: "0 20px",
    marginLeft: "8px",
    cursor: "pointer",
  };

  const grantsContainerStyle: React.CSSProperties = {
    padding: "16px 0",
    overflow: "auto",
    maxHeight: "400px",
  };

  const assistantButtonStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "8px 15px",
    backgroundColor: "#14558F",
    color: "white",
    borderRadius: "20px",
    fontSize: "14px",
    marginTop: "10px",
    border: "none",
    cursor: "pointer",
    transition: "background-color 0.2s",
  };

  const grantCardStyle: React.CSSProperties = {
    padding: "16px",
    backgroundColor: "#f9f9f9",
    borderRadius: "8px",
    marginBottom: "16px",
    border: "1px solid #e0e0e0",
  };

  const grantCardHeaderStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
    width: "100%",
  };

  const grantCardTitleStyle: React.CSSProperties = {
    fontSize: "16px",
    fontWeight: "bold",
    color: "#14558F",
  };

  // Helper function to normalize grant name
  const normalizeGrantName = (name: string): string => {
    return name?.trim() || "";
  };

  // Function to check if a specific NOFO is pinned
  const isNofoPinned = (nofoName: string): boolean => {
    // Normalize the name by trimming
    const normalizedName = normalizeGrantName(nofoName);

    // If name is empty, we can't identify this grant
    if (!normalizedName) return false;

    return pinnedGrants.some((pg) => {
      // Normalize pinned grant name
      const pinnedName = normalizeGrantName(pg.name);

      // Match by name
      return normalizedName === pinnedName;
    });
  };

  // Handle pinning a grant (for admins only)
  const handlePinGrant = async (
    grant: GrantRecommendation,
    event?: React.MouseEvent
  ) => {
    if (event) {
      event.stopPropagation(); // Prevent triggering the parent click handler
    }

    if (!isAdmin) return;

    // Normalize grant name
    const normalizedName = normalizeGrantName(grant.name);

    // Skip if we can't identify this grant
    if (!normalizedName) {
      console.warn("Cannot pin grant with no name");
      return;
    }

    try {
      // Call API to update NOFO pinned status
      await apiClient.landingPage.updateNOFOStatus(
        normalizedName,
        undefined,
        true
      );

      // Create a pinnable grant object
      const pinnableGrant: PinnableGrant = {
        ...grant,
        name: normalizedName,
        isPinned: true,
      };

      // Update local state
      const updatedPinnedGrants = [...pinnedGrants, pinnableGrant];
      setPinnedGrants(updatedPinnedGrants);
    } catch (error) {
      console.error("Failed to pin grant:", error);
    }
  };

  // Handle unpinning a grant (for admins only)
  const handleUnpinGrant = async (
    grantName: string,
    event?: React.MouseEvent
  ) => {
    if (event) {
      event.stopPropagation(); // Prevent triggering the parent click handler
    }

    if (!isAdmin) return;

    // Normalize the name
    const normalizedName = normalizeGrantName(grantName);

    // Skip if we can't identify this grant
    if (!normalizedName) {
      console.warn("Cannot unpin grant with no name");
      return;
    }

    try {
      // Call API to update NOFO pinned status
      await apiClient.landingPage.updateNOFOStatus(
        normalizedName,
        undefined,
        false
      );

      // Update local state
      const updatedPinnedGrants = pinnedGrants.filter((grant) => {
        const pinnedName = normalizeGrantName(grant.name);
        return pinnedName !== normalizedName;
      });

      setPinnedGrants(updatedPinnedGrants);
    } catch (error) {
      console.error("Failed to unpin grant:", error);
    }
  };

  // Reusable search icon component
  const SearchIcon = ({ color }: { color?: string }) => (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill={color || "#666666"}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z" />
    </svg>
  );

  // Styles
  const searchContainerStyle: React.CSSProperties = {
    position: "relative",
    maxWidth: "650px",
    width: "100%",
    margin: "0 auto",
    zIndex: 100,
  };

  const inputContainerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
  };

  // Visually hidden label - accessible to screen readers, hidden visually
  // The placeholder provides visual context for sighted users
  const labelStyle: React.CSSProperties = {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: "0",
  };

  const searchIconStyle: React.CSSProperties = {
    position: "absolute",
    left: "15px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#666",
    pointerEvents: "none",
    zIndex: 1,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 20px 14px 45px",
    fontSize: "16px",
    borderRadius: "25px",
    border: "1px solid #e0e0e0",
    boxSizing: "border-box",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
    transition: "all 0.2s ease",
    backgroundColor: "#ffffff",
    cursor: isLoading ? "not-allowed" : "text",
    opacity: isLoading ? 0.7 : 1,
  };

  const clearButtonStyle: React.CSSProperties = {
    position: "absolute",
    right: "15px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: isLoading ? "not-allowed" : "pointer",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#666",
    transition: "color 0.2s ease",
    opacity: isLoading ? 0.7 : 1,
  };

  const clearButtonHoverStyle: React.CSSProperties = {
    ...clearButtonStyle,
    color: "#333",
  };

  const resultsContainerStyle: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: "0 0 15px 15px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.15)",
    maxHeight: "600px",
    minHeight: "200px",
    overflowY: "auto",
    zIndex: 10,
    marginTop: "5px",
    border: "1px solid #e0e0e0",
  };

  const resultItemStyle: React.CSSProperties = {
    padding: "12px 15px",
    cursor: "pointer",
    borderBottom: "1px solid #f0f0f0",
    transition: "background-color 0.2s",
  };

  const selectedItemStyle: React.CSSProperties = {
    ...resultItemStyle,
    backgroundColor: "#f0f7ff",
    borderLeft: "3px solid #14558F",
  };

  const pinnedItemStyle: React.CSSProperties = {
    ...resultItemStyle,
    borderLeft: "3px solid #008798",
    backgroundColor: "#f0ffff",
  };

  const selectedPinnedItemStyle: React.CSSProperties = {
    ...pinnedItemStyle,
    backgroundColor: "#e0f7f7",
    borderLeft: "3px solid #14558F",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    padding: "10px 15px",
    backgroundColor: "#f9f9f9",
    fontWeight: "bold",
    fontSize: "14px",
    color: "#666",
  };

  const emptyPromptStyle: React.CSSProperties = {
    padding: "20px",
    textAlign: "center",
    color: "#555",
    fontSize: "14px",
  };

  const pinnedBadgeStyle: React.CSSProperties = {
    display: "inline-block",
    fontSize: "14px",
    backgroundColor: "#005a63",
    color: "white",
    padding: "2px 6px",
    borderRadius: "10px",
    marginLeft: "6px",
    verticalAlign: "middle",
  };

  // Pin/unpin button styles
  const pinButtonStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "8px",
    marginLeft: "8px",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.2s ease",
  };

  const unpinButtonStyle: React.CSSProperties = {
    ...pinButtonStyle,
    color: "#E74C3C", // Red color for unpinning
  };

  // Toggle the expanded state of a grant
  const toggleGrantExpanded = (
    grantKey: string,
    event?: React.MouseEvent | React.KeyboardEvent
  ) => {
    // Stop event propagation for both mouse and keyboard events
    if (event) {
      event.stopPropagation(); // Prevent triggering card click
      event.preventDefault(); // Ensure the event doesn't bubble up
      event.nativeEvent.stopImmediatePropagation(); // Ensure other handlers don't fire
    }

    setExpandedGrants((prev) => {
      const isCurrentlyExpanded = !!prev[grantKey];

      return {
        ...prev,
        [grantKey]: !isCurrentlyExpanded,
      };
    });
  };


  // Reusable component for View All Grants button
  const ViewAllGrantsButton = () => (
    <button
      style={{
        ...assistantButtonStyle,
        backgroundColor: "#14558F",
        marginLeft: "8px",
      }}
      onClick={() => setShowViewAllModal(true)}
      onMouseOver={(e) => {
        e.currentTarget.style.backgroundColor = "#104472";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.backgroundColor = "#14558F";
      }}
      onFocus={(e) => {
        e.currentTarget.style.backgroundColor = "#104472";
        e.currentTarget.style.outline = "2px solid #0088FF";
        e.currentTarget.style.outlineOffset = "2px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.backgroundColor = "#14558F";
        e.currentTarget.style.outline = "none";
        e.currentTarget.style.outlineOffset = "0";
      }}
      aria-label="View all available grants"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginRight: "8px", verticalAlign: "middle" }}
        aria-hidden="true"
      >
        <path
          d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"
          fill="white"
        />
      </svg>
      View All Grants
    </button>
  );

  // Close modal on outside click
  useEffect(() => {
    if (!showHowToModal) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        howToRef.current &&
        !howToRef.current.contains(event.target as Node)
      ) {
        setShowHowToModal(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showHowToModal]);

  return (
    <div style={searchContainerStyle} ref={searchRef}>
      <label htmlFor="grant-search-input" style={labelStyle}>
        Search for grants
      </label>
      <div style={inputContainerStyle}>
        <div style={searchIconStyle}>
          <SearchIcon color="#14558F" />
        </div>
        <input
          id="grant-search-input"
          ref={inputRef}
          type="text"
          placeholder="Search grants or describe what you need..."
          aria-label="Search grants or describe what you need"
          aria-describedby="search-help-know-grant search-help-not-sure"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={showResults ? "search-results-listbox" : undefined}
          aria-activedescendant={
            selectedIndex >= 0 && showResults
              ? `search-result-${selectedIndex}`
              : undefined
          }
          role="combobox"
          style={{
            ...inputStyle,
            cursor:
              isLoading || documents.some((doc) => doc.label === searchTerm)
                ? "not-allowed"
                : "text",
            opacity:
              isLoading || documents.some((doc) => doc.label === searchTerm)
                ? 0.7
                : 1,
          }}
          value={searchTerm}
          onChange={(e) => {
            // Only allow changes if no NOFO is selected
            if (!documents.some((doc) => doc.label === searchTerm)) {
              setSearchTerm(e.target.value);
              setShowResults(true);
              // Don't close AI assistant - both can work together now
            }
          }}
          onFocus={() => {
            if (
              !isLoading &&
              !documents.some((doc) => doc.label === searchTerm)
            ) {
              setShowResults(true);
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={
            isLoading || documents.some((doc) => doc.label === searchTerm)
          }
        />
        {searchTerm && !isLoading && (
          <button
            style={clearButtonStyle}
            onClick={() => {
              setSearchTerm("");
              setShowResults(false);
              setSelectedIndex(-1);
              setFilteredDocuments(documents);
              setFilteredPinnedGrants(pinnedGrants);
              resetAISearch();
              setExpandedGrants({});
              // Reset the document selection with null to ensure parent state is cleared
              onSelectDocument(null);
              inputRef.current?.focus();
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#333";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#666";
            }}
            aria-label="Clear search"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
                fill="currentColor"
              />
            </svg>
          </button>
        )}
        {isLoading && (
          <div
            style={{
              position: "absolute",
              right: "15px",
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <Spinner size="normal" />
          </div>
        )}
      </div>

      {/* Search Results Count Announcement for Screen Readers */}
      {showResults && searchTerm.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {(() => {
            const totalResults = filteredPinnedGrants.length + recommendedGrants.length + filteredDocuments.length;
            return totalResults === 0
              ? `No results found for "${searchTerm}"`
              : `${totalResults} result${totalResults === 1 ? "" : "s"} found`;
          })()}
        </div>
      )}

      {/* Single Smart Search - Unified Results */}
      {showResults && (
        <div style={resultsContainerStyle}>
          {/* Empty State - When no search term */}
          {searchTerm.length === 0 && (
            <div style={emptyPromptStyle}>
              <div
                style={{
                  background:
                    "linear-gradient(135deg, #e6f4ff 0%, #f0f9ff 100%)",
                  borderRadius: "12px",
                  padding: "20px 24px",
                  margin: "15px 0",
                  border: "2px solid #14558F",
                  boxShadow: "0 2px 8px rgba(0, 115, 187, 0.1)",
                  textAlign: "left",
                }}
              >
                <p
                  id="search-help-know-grant"
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "14px",
                    color: "#333",
                    lineHeight: "1.6",
                  }}
                >
                  <strong>Search by grant name</strong> — Type a grant name to find exact matches instantly.
                </p>
                <p
                  id="search-help-not-sure"
                  style={{
                    margin: "0",
                    fontSize: "14px",
                    color: "#333",
                    lineHeight: "1.6",
                  }}
                >
                  <strong>Or describe what you need</strong> — Type a description and AI will suggest matching grants automatically.
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <ViewAllGrantsButton />
              </div>
            </div>
          )}

          {/* Listbox containing only option elements */}
          <div
            id="search-results-listbox"
            role="listbox"
            style={{
              marginTop: searchTerm.length === 0 ? "10px" : "0",
            }}
          >
          {/* Pinned grants section - show when search is empty OR when filtered */}
          {(searchTerm.length === 0
            ? pinnedGrants.length > 0
            : filteredPinnedGrants.length > 0) && (
            <>
              <div style={sectionHeaderStyle}>Pinned Grants</div>
              {(searchTerm.length === 0
                ? pinnedGrants
                : filteredPinnedGrants
              ).map((grant, index) => (
                <div
                  key={`pinned-${index}`}
                  id={`search-result-${index}`}
                    role="option"
                    aria-selected={selectedIndex === index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    ...(selectedIndex === index
                      ? selectedPinnedItemStyle
                      : pinnedItemStyle),
                    padding: "12px 15px",
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <button
                    onClick={() => {
                      handlePinnedGrantSelect(grant);
                    }}
                    onFocus={(e) => {
                      setSelectedIndex(index);
                      e.currentTarget.style.outline = "2px solid #0088FF";
                      e.currentTarget.style.outlineOffset = "2px";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.outline = "none";
                    }}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "inherit",
                      fontSize: "inherit",
                      fontFamily: "inherit",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                    aria-label={`Select ${grant.name}`}
                  >
                    <span>{grant.name}</span>
                    {renderGrantTypeBadge(grant.grantType)}
                    <span style={pinnedBadgeStyle}>Pinned</span>
                  </button>

                  {isAdmin && (
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <button
                        onClick={(e) => handleUnpinGrant(grant.name, e)}
                        style={unpinButtonStyle}
                        title="Unpin grant"
                        aria-label={`Unpin ${grant.name}`}
                        onMouseOver={(e) => {
                          e.currentTarget.style.backgroundColor = "#f8e0e0";
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.backgroundColor = "#f8e0e0";
                          e.currentTarget.style.outline = "2px solid #0088FF";
                          e.currentTarget.style.outlineOffset = "2px";
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                          e.currentTarget.style.outline = "none";
                          e.currentTarget.style.outlineOffset = "0";
                        }}
                      >
                        <LuPinOff size={20} color="#E74C3C" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* AI Suggestions Section - Shows after pinned grants, before available grants */}
          {searchTerm.length >= 3 && (
            <div
              style={{
                borderTop: (searchTerm.length === 0
                  ? pinnedGrants.length > 0
                  : filteredPinnedGrants.length > 0) ? "2px solid #e0e0e0" : "none",
                marginTop: (searchTerm.length === 0
                  ? pinnedGrants.length > 0
                  : filteredPinnedGrants.length > 0) ? "8px" : "0",
                paddingTop: (searchTerm.length === 0
                  ? pinnedGrants.length > 0
                  : filteredPinnedGrants.length > 0) ? "12px" : "0",
              }}
            >
              {/* AI Loading State */}
              {isAISearching && (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    backgroundColor: "#f8f9ff",
                    borderRadius: "8px",
                    margin: "8px 12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
                    <Spinner size="normal" />
                    <div>
                      <div
                        style={{
                          color: "#14558F",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        {loadingMessages[loadingMessageIndex]}
                      </div>
                      <div
                        style={{
                          marginTop: "4px",
                          color: "#999",
                          fontSize: "12px",
                        }}
                      >
                        Finding AI-powered suggestions...
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Recommendations */}
              {!isAISearching && recommendedGrants.length > 0 && (
                <div style={{ padding: "0 12px 12px 12px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 0",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#14558F",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                        stroke="#14558F"
                        strokeWidth="2"
                      />
                      <path
                        d="M8 12H8.01M12 12H12.01M16 12H16.01"
                        stroke="#14558F"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    AI Suggestions based on "{searchTerm}"
                  </div>
                  <div
                    style={{
                      maxHeight: "250px",
                      overflowY: "auto",
                    }}
                  >
                    {recommendedGrants.map((grant, index) => {
                      const grantName = grant.name || "";
                      const grantKey = `ai-grant-${grantName}-${index}`;
                      const isExpanded = !!expandedGrants[grantKey];

                      return (
                        <div
                          key={grantKey}
                          style={{
                            padding: "12px",
                            backgroundColor: "#f8f9ff",
                            borderRadius: "8px",
                            marginBottom: "8px",
                            border: "1px solid #e8ecf4",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <button
                              onClick={() => handleAIGrantSelect(grant.summaryUrl, grantName)}
                              style={{
                                flex: 1,
                                textAlign: "left",
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                              }}
                              aria-label={`Select ${grantName}`}
                            >
                              <span style={{ fontSize: "14px", fontWeight: "500", color: "#14558F" }}>
                                {grantName}
                              </span>
                              {renderGrantTypeBadge(grantTypeMap[grantName])}
                            </button>
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? "Collapse" : "Expand"} details`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                fontSize: "12px",
                                color: "#666",
                                cursor: "pointer",
                                padding: "4px 8px",
                                backgroundColor: "#fff",
                                borderRadius: "4px",
                                border: "1px solid #e0e0e0",
                              }}
                              onClick={(e) => toggleGrantExpanded(grantKey, e)}
                            >
                              {isExpanded ? (
                                <LuChevronDown size={14} style={{ marginRight: "4px" }} />
                              ) : (
                                <LuChevronRight size={14} style={{ marginRight: "4px" }} />
                              )}
                              Details
                            </button>
                          </div>

                          {isExpanded && (
                            <div
                              style={{
                                fontSize: "13px",
                                color: "#666",
                                marginTop: "10px",
                                padding: "10px",
                                backgroundColor: "#fff",
                                borderRadius: "4px",
                              }}
                            >
                              {grant.keyRequirements.length > 0 ? (
                                <ul style={{ margin: "0 0 0 16px", padding: "0" }}>
                                  {grant.keyRequirements.map((req, i) => (
                                    <li key={i} style={{ marginBottom: "4px" }}>{req}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p style={{ margin: "0", fontStyle: "italic" }}>
                                  Click to view full grant details.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Prompt to trigger AI search */}
              {!isAISearching && !aiSearchTriggered && searchTerm.length >= 3 && (
                <div
                  style={{
                    padding: "12px 16px",
                    margin: "8px 12px",
                    backgroundColor: "#f0f7ff",
                    borderRadius: "8px",
                    border: "1px dashed #14558F",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#333" }}>
                    <strong>Press Enter</strong> to get AI-powered suggestions for "{searchTerm}"
                  </div>
                  <button
                    onClick={() => triggerAISearch(searchTerm)}
                    style={{
                      backgroundColor: "#14558F",
                      color: "white",
                      border: "none",
                      borderRadius: "16px",
                      padding: "6px 14px",
                      fontSize: "13px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = "#104472";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = "#14558F";
                    }}
                  >
                    Find with AI
                  </button>
                </div>
              )}

              {/* No AI results message */}
              {!isAISearching && aiSearchTriggered && recommendedGrants.length === 0 && (
                <div
                  style={{
                    padding: "16px",
                    margin: "8px 12px",
                    textAlign: "center",
                    color: "#666",
                    fontSize: "13px",
                    backgroundColor: "#f9f9f9",
                    borderRadius: "8px",
                  }}
                >
                  No AI suggestions found for "{searchTerm}". Try different keywords or{" "}
                  <button
                    onClick={() => setShowViewAllModal(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#14558F",
                      textDecoration: "underline",
                      cursor: "pointer",
                      fontSize: "13px",
                      padding: 0,
                    }}
                  >
                    browse all grants
                  </button>.
                </div>
              )}
            </div>
          )}

          {/* Available grants section - ONLY show when user is actively searching */}
          {searchTerm.length > 0 && filteredDocuments.length > 0 && (
            <>
              <div 
                style={{
                  ...sectionHeaderStyle,
                  borderTop: (filteredPinnedGrants.length > 0 || (searchTerm.length >= 3 && (isAISearching || recommendedGrants.length > 0 || aiSearchTriggered))) ? "2px solid #e0e0e0" : "none",
                  marginTop: (filteredPinnedGrants.length > 0 || (searchTerm.length >= 3 && (isAISearching || recommendedGrants.length > 0 || aiSearchTriggered))) ? "8px" : "0",
                  paddingTop: (filteredPinnedGrants.length > 0 || (searchTerm.length >= 3 && (isAISearching || recommendedGrants.length > 0 || aiSearchTriggered))) ? "12px" : "0",
                }}
              >
                Available Grants
              </div>
              {filteredDocuments.map((doc, index) => {
                const docName = doc.label || "";

                const isPinned = isNofoPinned(docName);
                // Calculate index accounting for pinned grants and AI suggestions
                const baseIndex = filteredPinnedGrants.length;
                const aiResultsCount = recommendedGrants.length;
                const itemIndex = baseIndex + aiResultsCount + index;

                return (
                  <div
                    key={`doc-${docName}-${index}`}
                      id={`search-result-${itemIndex}`}
                      role="option"
                      aria-selected={selectedIndex === itemIndex}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                        ...(selectedIndex === itemIndex
                        ? selectedItemStyle
                        : resultItemStyle),
                      padding: "12px 15px",
                    }}
                    onMouseEnter={() => setSelectedIndex(itemIndex)}
                  >
                    <button
                      onClick={() => {
                        setSearchTerm(docName);
                        onSelectDocument(doc);
                        setShowResults(false);
                      }}
                      onFocus={(e) => {
                        setSelectedIndex(itemIndex);
                        e.currentTarget.style.outline = "2px solid #0088FF";
                        e.currentTarget.style.outlineOffset = "2px";
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.outline = "none";
                      }}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: "inherit",
                        fontSize: "inherit",
                        fontFamily: "inherit",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      aria-label={`Select ${docName}`}
                    >
                      <span>{docName}</span>
                      {renderGrantTypeBadge(grantTypeMap[docName])}
                    </button>

                    {isAdmin && (
                      <div style={{ display: "flex", alignItems: "center" }}>
                        {isPinned ? (
                          <button
                            onClick={(e) => {
                              handleUnpinGrant(docName, e);
                            }}
                            style={unpinButtonStyle}
                            title="Unpin grant"
                            aria-label={`Unpin ${docName}`}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#f8e0e0";
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#f8e0e0";
                              e.currentTarget.style.outline =
                                "2px solid #0088FF";
                              e.currentTarget.style.outlineOffset = "2px";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                              e.currentTarget.style.outline = "none";
                              e.currentTarget.style.outlineOffset = "0";
                            }}
                          >
                            <LuPinOff size={20} color="#E74C3C" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              // Create a grant object from the document
                              const grant: GrantRecommendation = {
                                id: "", // ID not needed
                                name: docName,
                                matchScore: 80,
                                eligibilityMatch: true,
                                matchReason: "Admin selected",
                                fundingAmount: "Varies",
                                deadline: "See details",
                                keyRequirements: [],
                                summaryUrl: doc.value,
                              };
                              handlePinGrant(grant, e);
                            }}
                            style={pinButtonStyle}
                            title="Pin grant to top of recommendations"
                            aria-label={`Pin ${docName}`}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#e0f0ff";
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#e0f0ff";
                              e.currentTarget.style.outline =
                                "2px solid #0088FF";
                              e.currentTarget.style.outlineOffset = "2px";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.backgroundColor =
                                "transparent";
                              e.currentTarget.style.outline = "none";
                              e.currentTarget.style.outlineOffset = "0";
                            }}
                          >
                            <LuPin size={20} color="#14558F" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
          </div>

          {/* No exact matches message - only when no results AND AI not triggered yet */}
          {searchTerm.length > 0 &&
            searchTerm.length < 3 &&
            filteredPinnedGrants.length === 0 &&
            filteredDocuments.length === 0 && (
              <div
                style={{ padding: "20px", textAlign: "center", color: "#666", fontSize: "14px" }}
              >
                <p>No matches found. Type at least 3 characters for AI suggestions.</p>
              </div>
            )}
        </div>
      )}

      {/* View All Grants Modal */}
      {showViewAllModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => setShowViewAllModal(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowViewAllModal(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-all-grants-modal-title"
        >
          <div
            ref={viewAllModalRef}
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              maxWidth: "900px",
              width: "100%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="document"
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 24px",
                borderBottom: "2px solid #e0e0e0",
                backgroundColor: "#f9f9f9",
              }}
            >
              <h2
                id="view-all-grants-modal-title"
                style={{
                  margin: 0,
                  fontSize: "24px",
                  color: "#14558F",
                  fontWeight: "600",
                }}
              >
                All Available Grants ({documents.length})
              </h2>
              <button
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#555",
                  fontSize: "28px",
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "4px",
                  transition: "background-color 0.2s",
                }}
                onClick={() => setShowViewAllModal(false)}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#f0f0f0";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.backgroundColor = "#f0f0f0";
                  e.currentTarget.style.outline = "2px solid #0088FF";
                  e.currentTarget.style.outlineOffset = "2px";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.outline = "none";
                  e.currentTarget.style.outlineOffset = "0";
                }}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div
              style={{
                padding: "24px",
                overflowY: "auto",
                flex: 1,
              }}
            >
              {isLoading ? (
                <div style={{ textAlign: "center", padding: "40px" }}>
                  <Spinner size="large" />
                  <div style={{ marginTop: "15px", color: "#666" }}>
                    Loading grants...
                  </div>
                </div>
              ) : (
                <>
                  {/* Pinned Grants Section */}
                  {pinnedGrants.length > 0 && (
                    <div style={{ marginBottom: "30px" }}>
                      <h3
                        style={{
                          fontSize: "18px",
                          color: "#14558F",
                          marginBottom: "16px",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ marginRight: "8px" }}
                          aria-hidden="true"
                        >
                          <path
                            d="M16 12V4H17V2H7V4H8V12L6 14V16H11.2V22H12.8V16H18V14L16 12Z"
                            fill="#008798"
                          />
                        </svg>
                        Pinned Grants ({pinnedGrants.length})
                      </h3>
                      <div
                        style={{
                          border: "1px solid #e0e0e0",
                          borderRadius: "8px",
                          backgroundColor: "#fff",
                        }}
                      >
                        {pinnedGrants
                          .sort((a, b) =>
                            a.name.localeCompare(b.name, undefined, {
                              sensitivity: "base",
                            })
                          )
                          .map((grant, index, sortedPinned) => (
                            <div
                              key={`pinned-${grant.name}`}
                              style={{
                                padding: "14px 16px",
                                borderBottom:
                                  index < sortedPinned.length - 1
                                    ? "1px solid #e0e0e0"
                                    : "none",
                                cursor: "pointer",
                                transition: "background-color 0.2s ease",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                              onClick={() => {
                                handlePinnedGrantSelect(grant);
                                setShowViewAllModal(false);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handlePinnedGrantSelect(grant);
                                  setShowViewAllModal(false);
                                }
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#f0ffff";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`Select ${grant.name}`}
                              onFocus={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#f0ffff";
                                e.currentTarget.style.outline =
                                  "2px solid #0088FF";
                                e.currentTarget.style.outlineOffset = "2px";
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                                e.currentTarget.style.outline = "none";
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "15px",
                                  color: "#14558F",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                }}
                              >
                                <span>{grant.name}</span>
                                {renderGrantTypeBadge(grant.grantType)}
                                <span
                                  style={{
                                    display: "inline-block",
                                    fontSize: "14px",
                                    backgroundColor: "#005a63",
                                    color: "white",
                                    padding: "3px 8px",
                                    borderRadius: "12px",
                                  }}
                                >
                                  Pinned
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* All Grants Section */}
                  <div>
                    <div
                      style={{
                        border: "1px solid #e0e0e0",
                        borderRadius: "8px",
                        backgroundColor: "#fff",
                      }}
                    >
                      {documents
                        .filter((doc) => !isNofoPinned(doc.label))
                        .sort((a, b) =>
                          a.label.localeCompare(b.label, undefined, {
                            sensitivity: "base",
                          })
                        )
                        .map((doc, index, sortedDocs) => {
                          return (
                            <div
                              key={`doc-${doc.label}`}
                              style={{
                                padding: "14px 16px",
                                borderBottom:
                                  index < sortedDocs.length - 1
                                    ? "1px solid #e0e0e0"
                                    : "none",
                                cursor: "pointer",
                                transition: "background-color 0.2s ease",
                              }}
                              onClick={() => {
                                setSearchTerm(doc.label);
                                onSelectDocument(doc);
                                setShowViewAllModal(false);
                                setShowResults(false);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSearchTerm(doc.label);
                                  onSelectDocument(doc);
                                  setShowViewAllModal(false);
                                  setShowResults(false);
                                }
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#f7faff";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                              }}
                              role="button"
                              tabIndex={0}
                              aria-label={`Select ${doc.label}`}
                              onFocus={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#f7faff";
                                e.currentTarget.style.outline =
                                  "2px solid #0088FF";
                                e.currentTarget.style.outlineOffset = "2px";
                              }}
                              onBlur={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "transparent";
                                e.currentTarget.style.outline = "none";
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "15px",
                                  color: "#14558F",
                                }}
                              >
                                {doc.label}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {documents.length === 0 && pinnedGrants.length === 0 && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px",
                        color: "#666",
                        fontSize: "16px",
                      }}
                    >
                      No grants available at this time.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegratedSearchBar;
