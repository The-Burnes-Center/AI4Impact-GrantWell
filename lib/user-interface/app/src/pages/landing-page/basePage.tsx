import React, { useContext, useState, useEffect, CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Auth } from "aws-amplify";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { v4 as uuidv4 } from "uuid";
import "../../styles/base-page.css";
import IntegratedSearchBar from "../../components/search/IntegratedSearchBar";
import {
  addToRecentlyViewed,
  getRecentlyViewed,
  cleanupRecentlyViewed,
} from "../../utils/recently-viewed-nofos";

export default function Welcome() {
  // **State Variables**
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [recentlyViewedNOFOs, setRecentlyViewedNOFOs] = useState([]);

  // **Context and Navigation**
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const navigate = useNavigate();

  // **Styles**
  const logoStyle: CSSProperties = {
    width: "100px",
    height: "100px",
  };

  const mainTextColor = "#006499";
  const bodyTextColor = "#5a5a5a";
  const primaryBlue = "#0073bb"; // Match header blue color

  const buttonStyle: CSSProperties = {
    backgroundColor: primaryBlue, // Use blue from the header when active
    color: "white",
    border: "none",
    padding: "12px 22px",
    fontSize: "16px",
    borderRadius: "25px", // Oval/pill shape
    cursor: "pointer",
    transition: "all 0.2s ease",
    fontWeight: "500",
    margin: "0 5px",
    boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
  };

  const disabledButtonStyle: CSSProperties = {
    ...buttonStyle,
    backgroundColor: "#f0f0f0",
    color: "#707070",
    cursor: "not-allowed",
    boxShadow: "none",
  };

  const buttonHoverStyle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if ((e.target as HTMLButtonElement).disabled) return;
    (e.target as HTMLElement).style.backgroundColor = "#005d94"; // Darker blue on hover
    (e.target as HTMLElement).style.boxShadow = "0 4px 8px rgba(0,0,0,0.1)";
  };

  const buttonLeaveStyle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if ((e.target as HTMLButtonElement).disabled) return;
    (e.target as HTMLElement).style.backgroundColor = primaryBlue;
    (e.target as HTMLElement).style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
  };

  const linkStyle: CSSProperties = {
    color: "#006499",
    textDecoration: "none",
  };

  // **Effect Hooks**
  // Check for admin privilege
  useEffect(() => {
    (async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        if (!result || Object.keys(result).length === 0) {
          Auth.signOut();
          return;
        }
        const adminRole =
          result?.signInUserSession?.idToken?.payload["custom:role"];
        if (adminRole && adminRole.includes("Admin")) {
          setIsAdmin(true); // Set admin status to true if user has admin role
        }
      } catch (e) {
        console.error("Error checking admin status:", e);
      }
    })();
  }, []);

  // Load recently viewed NOFOs from localStorage
  useEffect(() => {
    const storedHistory = getRecentlyViewed();
    setRecentlyViewedNOFOs(storedHistory);
  }, []);

  // Filter out archived NOFOs from history when documents change
  useEffect(() => {
    if (documents.length === 0) return;

    // Get the current list of NOFO names
    const activeNofoNames = documents.map((doc) => doc.label);

    // Clean up recently viewed NOFOs and update state
    const filteredHistory = cleanupRecentlyViewed(activeNofoNames);
    setRecentlyViewedNOFOs(filteredHistory);
  }, [documents]);

  // Fetch NOFO documents from S3
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        await getNOFOListFromS3();
      } catch (error) {
        console.error("Failed to fetch NOFO documents:", error);
      }
    };
    fetchDocuments();
  }, []);

  // **Functions**
  // Get NOFO list from S3
  const getNOFOListFromS3 = async () => {
    setLoading(true);
    try {
      const result = await apiClient.landingPage.getNOFOs();
      const folders = result.folders || [];
      console.log(
        `Received ${folders.length} active NOFOs for landing page display`
      );

      // For debugging: Check if we have nofoData with status information too
      if (result.nofoData) {
        const activeCount = result.nofoData.filter(
          (nofo) => nofo.status === "active"
        ).length;
        const archivedCount = result.nofoData.filter(
          (nofo) => nofo.status === "archived"
        ).length;
        console.log(
          `NOFO status breakdown - Active: ${activeCount}, Archived: ${archivedCount}`
        );
      }

      // Sort folders alphabetically (case-insensitive)
      const sortedFolders = [...folders].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );

      setDocuments(
        sortedFolders.map((document) => ({
          label: document,
          value: document + "/",
        }))
      );
    } catch (error) {
      console.error("Error retrieving NOFOs: ", error);
    }
    setLoading(false);
  };

  // Handle selecting a NOFO document
  const handleNOFOSelect = (href, selectedNOFO) => {
    // Update recently viewed NOFOs using utility function
    const updatedHistory = addToRecentlyViewed(selectedNOFO);
    setRecentlyViewedNOFOs(updatedHistory);

    // Navigate to the selected NOFO
    navigate(href);
  };

  // **Components**
  // HistoryPanel component
  const HistoryPanel = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "20px",
        marginBottom: "30px",
      }}
    >
      <h2
        style={{
          gridColumn: "span 3", // Span all 3 columns
          fontSize: "24px",
          lineHeight: "1",
          textAlign: "center",
          color: mainTextColor,
          marginBottom: "20px",
        }}
      >
        Recently viewed funding calls (NOFOs)
      </h2>
      {recentlyViewedNOFOs.length > 0 ? (
        recentlyViewedNOFOs.slice(0, 6).map((nofo, index) => (
          <button
            key={index}
            style={{
              padding: "15px",
              border: "1px solid #e1e4e8",
              borderRadius: "8px",
              backgroundColor: "#f9f9f9",
              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
              transition: "all 0.2s ease",
              cursor: "pointer",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              width: "100%",
              textAlign: "left",
            }}
            onClick={() =>
              handleNOFOSelect(
                `/landing-page/basePage/checklists/${encodeURIComponent(
                  nofo.value
                )}`,
                nofo
              )
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.15)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #2c4fdb";
              e.currentTarget.style.outlineOffset = "2px";
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.15)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
              e.currentTarget.style.outlineOffset = "0";
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
            aria-label={`View ${nofo.label}`}
          >
            <span
              style={{
                fontSize: "16px",
                fontWeight: "bold",
                display: "block",
                marginBottom: "8px",
                color: primaryBlue,
              }}
            >
              {nofo.label}
            </span>
            <div
              style={{
                fontSize: "14px",
                color: "#5a5a5a",
                marginTop: "auto",
              }}
            >
              <span>Last viewed: {nofo.lastViewed}</span>
            </div>
          </button>
        ))
      ) : (
        <p
          style={{
            gridColumn: "span 3", // Span all 3 columns
            color: "#6b737b",
            fontSize: "16px",
            textAlign: "center",
          }}
        >
          You haven't viewed any NOFOs recently.
        </p>
      )}
    </div>
  );

  // Reusable InfoBanner Component
  const InfoBanner = ({
    title,
    description,
    buttonText = "",
    buttonAction = null,
    imageSrc = null,
    imageAlt = "",
    height,
    backgroundColor = "#06293d",
    mainTextColor = "#ffffff",
    bodyTextColor = "#ffffff",
    titleFontSize = "24px",
    buttonVariant = "normal",
    linkUrl = null,
    imagePosition = "right",
    titleAlign = "left",
    imageWidth = "150px",
  }: {
    title: string;
    description: string;
    buttonText?: string;
    buttonAction?: (() => void) | null;
    imageSrc?: string | null;
    imageAlt?: string;
    backgroundColor?: string;
    mainTextColor?: string;
    bodyTextColor?: string;
    titleFontSize?: string;
    buttonVariant?: "primary" | "normal" | "link" | "icon";
    linkUrl?: any;
    height?: any;
    imagePosition?: string;
    titleAlign?: any;
    imageWidth?: any;
  }) => {
    const bannerButtonStyle: CSSProperties = {
      backgroundColor: buttonVariant === "primary" ? "#006499" : "white",
      color: "#006499",
      border: "none",
      padding: "10px 15px",
      borderRadius: "4px",
      cursor: "pointer",
      textDecoration: buttonVariant === "link" ? "underline" : "none",
    };

    const content = (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          maxWidth: "900px",
          alignItems: "center",
          margin: "0 auto",
          flexDirection: "row",
          gap: "30px",
          marginTop: "15px",
        }}
      >
        {imagePosition === "left" && imageSrc && (
          <img src={imageSrc} alt={imageAlt} style={{ width: imageWidth }} />
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexDirection: "column",
            textAlign: titleAlign,
            width: buttonText ? "70%" : "80%",
          }}
        >
          {title && (
            <h2
              style={{
                fontSize: titleFontSize,
                margin: 1,
                color: mainTextColor,
              }}
            >
              {title}
            </h2>
          )}
          <p style={{ fontSize: "13px", color: bodyTextColor }}>
            {description}
          </p>
        </div>
        {imagePosition === "right" && imageSrc && (
          <img src={imageSrc} alt={imageAlt} style={{ width: imageWidth }} />
        )}
        {buttonText && buttonAction && (
          <button
            onClick={buttonAction}
            style={bannerButtonStyle}
            aria-label={buttonText}
          >
            {buttonText}
          </button>
        )}
      </div>
    );
    const learnMoreLinkStyle: CSSProperties = {
      color: mainTextColor === "#ffffff" ? "#ffffff" : "#0073bb",
      textDecoration: "underline",
      fontSize: "13px",
      marginTop: "8px",
      display: "inline-block",
      cursor: "pointer",
    };

    return (
      <div
        style={{
          backgroundColor: backgroundColor,
          padding: "20px",
          marginBlockEnd: "0",
          width: "100vw",
          height: height,
          position: "relative",
          left: "50%",
          right: "50%",
          marginLeft: "-50vw",
          marginRight: "-50vw",
          marginTop: "0px",
          marginBottom: "0px",
        }}
      >
        {content}
        {linkUrl && (
          <div
            style={{
              maxWidth: "900px",
              margin: "8px auto 0 auto",
              textAlign: titleAlign,
            }}
          >
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={learnMoreLinkStyle}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid #2c4fdb";
                e.currentTarget.style.outlineOffset = "2px";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
                e.currentTarget.style.outlineOffset = "0";
              }}
            >
              Learn More
            </a>
          </div>
        )}
      </div>
    );
  };

  const ContentBox = ({ children, backgroundColor = "#f1f6f9" }) => (
    <div
      style={{
        width: "100vw",
        backgroundColor,
        position: "relative",
        left: "50%",
        right: "50%",
        marginLeft: "-50vw",
        marginRight: "-50vw",
        boxSizing: "border-box",
        padding: "20px 0",
        marginTop: "0px",
        marginBottom: "0px",
      }}
    >
      <div
        style={{
          maxWidth: "950px",
          margin: "0 auto",
          padding: "0 40px",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );

  const ResourcesPanel = () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "25px",
        marginBottom: "30px",
      }}
    >
      <h2
        style={{
          gridColumn: "span 3",
          fontSize: "24px",
          lineHeight: "1",
          textAlign: "center",
          color: mainTextColor,
        }}
      >
        Additional Resources
      </h2>
      {[
        {
          title: "Federal Grant Finder",
          href: "https://simpler.grants.gov/",
          description:
            "Find grants you are eligible for with Grants.gov Federal Grants Finder.",
        },
        {
          title: "Register for Federal Funds Partnership Meetings",
          href: "https://us02web.zoom.us/meeting/register/tZUucuyhrzguHNJkkh-XlmZBlQQKxxG_Acjl",
          description:
            "Stay updated on current funding opportunities by joining our monthly informational sessions.",
        },
      ].map((resource, index) => (
        <div
          key={index}
          style={{
            padding: "15px",
            border: "1px solid #e1e4e8",
            borderRadius: "8px",
            backgroundColor: "#f9f9f9",
            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
            textAlign: "center",
          }}
        >
          <a
            href={resource.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...linkStyle,
              textDecoration: "none",
              display: "block",
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = "2px solid #2c4fdb";
              e.currentTarget.style.outlineOffset = "2px";
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = "none";
              e.currentTarget.style.outlineOffset = "0";
            }}
          >
            <span
              style={{
                fontSize: "18px",
                fontWeight: "bold",
                display: "block",
                marginBottom: "8px",
                color: mainTextColor,
                textAlign: "center",
              }}
            >
              {resource.title}
            </span>
            <div
              style={{
                fontSize: "14px",
                color: bodyTextColor,
                textAlign: "center",
              }}
            >
              {resource.description}
            </div>
          </a>
        </div>
      ))}
    </div>
  );

  // **Render**
  return (
    <>
      {/* Skip Navigation Link for Accessibility */}
      <a
        href="#main-content"
        style={{
          position: "absolute",
          left: "-9999px",
          zIndex: 999,
          padding: "10px 20px",
          backgroundColor: primaryBlue,
          color: "white",
          textDecoration: "none",
          borderRadius: "4px",
          fontWeight: "600",
        }}
        onFocus={(e) => {
          e.currentTarget.style.left = "10px";
          e.currentTarget.style.top = "10px";
        }}
        onBlur={(e) => {
          e.currentTarget.style.left = "-9999px";
        }}
        onClick={(e) => {
          e.preventDefault();
          const mainContent = document.getElementById("main-content");
          if (mainContent) {
            // Scroll to main content
            mainContent.scrollIntoView({ behavior: "smooth", block: "start" });
            // Move focus to main content
            mainContent.focus();
          }
        }}
      >
        Skip to main content
      </a>
      <div
        style={{
          maxWidth: "950px",
          margin: "0 auto",
          padding: "0 40px",
          marginTop: "70px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            marginTop: "40px",
            marginBottom: "30px",
            position: "relative",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: "15px",
              marginBottom: "10px",
            }}
          >
            <img
              src="/images/stateseal-color.png"
              alt="State Seal"
              style={logoStyle}
            />
            <h1
              style={{
                fontSize: "52px",
                margin: 0,
                color: mainTextColor,
                fontWeight: "600",
              }}
            >
              GrantWell
            </h1>
          </div>

          {/* Subtitle below both */}
          <p
            style={{
              fontSize: "16px",
              color: mainTextColor,
              margin: "5px 0 0 0",
              fontStyle: "italic",
              maxWidth: "600px",
              lineHeight: "1.4",
              textAlign: "center",
            }}
          >
            Free AI powered tool designed for finding and writing grants
          </p>
        </div>

        {/* New integrated search bar */}
        <IntegratedSearchBar
          documents={documents}
          onSelectDocument={setSelectedDocument}
          isLoading={loading}
        />

        {/* CTA Buttons - shown when grant is selected */}
        {selectedDocument && (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "10px",
              margin: "28px 0 8px 0",
              width: "100%",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => {
                handleNOFOSelect(
                  `/landing-page/basePage/checklists/${encodeURIComponent(
                    selectedDocument.value
                  )}`,
                  selectedDocument
                );
              }}
              style={{
                background: "#0073BB",
                color: "white",
                border: "none",
                borderRadius: "20px",
                padding: "10px 22px",
                fontSize: "15px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.2s, box-shadow 0.2s, outline 0.2s",
                minWidth: "180px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#005A94";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#0073BB";
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid #2c4fdb";
                e.currentTarget.style.outlineOffset = "2px";
                e.currentTarget.style.boxShadow =
                  "0 0 0 4px rgba(44, 79, 219, 0.2)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
                e.currentTarget.style.outlineOffset = "0px";
                e.currentTarget.style.boxShadow = "none";
              }}
              aria-label="View Key Requirements"
            >
              View Key Requirements
            </button>

            <button
              onClick={() => {
                // Track the NOFO as recently viewed before navigating to document editor
                const updatedHistory = addToRecentlyViewed(selectedDocument);
                setRecentlyViewedNOFOs(updatedHistory);

                // Navigate to document editor
                window.location.href = `/document-editor?nofo=${encodeURIComponent(
                  selectedDocument.value
                )}`;
              }}
              style={{
                background: "#0073BB",
                color: "white",
                border: "none",
                borderRadius: "20px",
                padding: "10px 22px",
                fontSize: "15px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.2s, box-shadow 0.2s, outline 0.2s",
                minWidth: "180px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#005A94";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#0073BB";
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid #2c4fdb";
                e.currentTarget.style.outlineOffset = "2px";
                e.currentTarget.style.boxShadow =
                  "0 0 0 4px rgba(44, 79, 219, 0.2)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
                e.currentTarget.style.outlineOffset = "0px";
                e.currentTarget.style.boxShadow = "none";
              }}
              aria-label="Write Project Narrative"
            >
              Write Project Narrative
            </button>

            <button
              onClick={() => {
                // Track the NOFO as recently viewed before navigating to chatbot
                const updatedHistory = addToRecentlyViewed(selectedDocument);
                setRecentlyViewedNOFOs(updatedHistory);

                // Navigate to chatbot
                const newSessionId = uuidv4();
                window.location.href = `/chatbot/playground/${newSessionId}?folder=${encodeURIComponent(
                  selectedDocument.value
                )}`;
              }}
              style={{
                background: "#0073BB",
                color: "white",
                border: "none",
                borderRadius: "20px",
                padding: "10px 22px",
                fontSize: "15px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background 0.2s, box-shadow 0.2s, outline 0.2s",
                minWidth: "180px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#005A94";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#0073BB";
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = "2px solid #2c4fdb";
                e.currentTarget.style.outlineOffset = "2px";
                e.currentTarget.style.boxShadow =
                  "0 0 0 4px rgba(44, 79, 219, 0.2)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = "none";
                e.currentTarget.style.outlineOffset = "0px";
                e.currentTarget.style.boxShadow = "none";
              }}
              aria-label="Get Grant Help"
            >
              Get Grant Help
            </button>
          </div>
        )}

        {/* How it works section - always visible */}
        <section
          aria-labelledby="how-it-works-heading"
          style={{
            margin: "20px auto 8px auto",
            padding: "0",
            maxWidth: "650px",
            textAlign: "center",
          }}
        >
          {/* Main Heading */}
          <h2
            id="how-it-works-heading"
            style={{
              fontSize: "18px",
              fontWeight: "600",
              color: "#006499",
              margin: "0 0 12px 0",
              textAlign: "center",
            }}
          >
            How it works
          </h2>

          {/* Single paragraph with inline links */}
          <p
            style={{
              fontSize: "15px",
              color: "#555",
              lineHeight: "1.6",
              margin: "0",
            }}
          >
            Search for a grant above, select one from the results, then choose
            an action:{" "}
            <strong style={{ color: "#0073BB", fontWeight: "600" }}>
              View Key Requirements
            </strong>{" "}
            to see eligibility and other NOFO requirements,{" "}
            <strong style={{ color: "#0073BB", fontWeight: "600" }}>
              Write Project Narrative
            </strong>{" "}
            to draft your proposal with AI assistance, or{" "}
            <strong style={{ color: "#0073BB", fontWeight: "600" }}>
              Get Grant Help
            </strong>{" "}
            to chat with our AI assistant.
          </p>

          {/* Screen reader notes - hidden visually */}
          <div
            style={{
              position: "absolute",
              width: "1px",
              height: "1px",
              padding: "0",
              margin: "-1px",
              overflow: "hidden",
              clip: "rect(0, 0, 0, 0)",
              whiteSpace: "nowrap",
              border: "0",
            }}
            role="note"
            aria-label="Screen reader note"
          >
            Screen-reader note: The search bar is the first interactive element
            on this page. After selecting a grant, navigate to the next heading
            or use "next button" to reach the action buttons. Each button loads
            a new page or tool. Use heading navigation to explore the content on
            each screen.
          </div>
        </section>

        {/* Add spacing before next section */}
        <div style={{ marginBottom: "20px" }} />

        {/* Admin Dashboard Section - shown only to admins */}
        {isAdmin && (
          <ContentBox backgroundColor="#f0f8ff">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "15px",
                padding: "20px 0",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  maxWidth: "700px",
                }}
              >
                <h2
                  style={{
                    fontSize: "20px",
                    fontWeight: "600",
                    color: mainTextColor,
                    margin: "0 0 10px 0",
                  }}
                >
                  Admin Dashboard
                </h2>
                <p
                  style={{
                    fontSize: "15px",
                    color: bodyTextColor,
                    lineHeight: "1.6",
                    margin: "0 0 15px 0",
                  }}
                >
                  To access the dashboard to add grants or manage users, click the button below.
                  <br />
                  <span style={{ fontSize: "13px", fontStyle: "italic", color: "#666" }}>
                    (This section is only visible to administrators)
                  </span>
                </p>
              </div>
              <button
                onClick={() => navigate("/dashboard")}
                style={{
                  background: "#006499",
                  color: "white",
                  border: "none",
                  borderRadius: "20px",
                  padding: "12px 28px",
                  fontSize: "16px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.2s, box-shadow 0.2s, outline 0.2s",
                  minWidth: "200px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#005A94";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#006499";
                }}
                onFocus={(e) => {
                  e.currentTarget.style.outline = "2px solid #2c4fdb";
                  e.currentTarget.style.outlineOffset = "2px";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 4px rgba(44, 79, 219, 0.2)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = "none";
                  e.currentTarget.style.outlineOffset = "0px";
                  e.currentTarget.style.boxShadow = "none";
                }}
                aria-label="Go to Admin Dashboard"
              >
                Go to Admin Dashboard
              </button>
            </div>
          </ContentBox>
        )}

        <ContentBox backgroundColor="#F6FCFF">
          <HistoryPanel />
        </ContentBox>

        {/* "Additional Resources" Panel */}
        <ContentBox>
          <ResourcesPanel />
        </ContentBox>

        {/* Feedback Section */}
        {/* <InfoBanner
          title="We Value Your Feedback!"
          height="150px"
          description="Help us make GrantWell better by sharing your thoughts and suggestions."
          buttonText="Open Feedback Form"
          buttonAction={() =>
            window.open("https://forms.gle/M2PHgWTVVRrRubpc7", "_blank")
          }
          backgroundColor="#006499"
        /> */}
      </div>

      {/* Footer Section */}
      <footer>
        {/* Affiliations Section */}
        <div
          style={{
            backgroundColor: "#06293d",
            padding: "30px 20px",
            marginBlockEnd: "0",
            width: "100vw",
            position: "relative",
            left: "50%",
            right: "50%",
            marginLeft: "-50vw",
            marginRight: "-50vw",
            marginTop: "0px",
            marginBottom: "0px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              maxWidth: "900px",
              margin: "0 auto",
              gap: "40px",
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                fontSize: "28px",
                color: "#ffffff",
                margin: "0",
                fontWeight: "600",
                flex: "0 0 auto",
              }}
            >
              Our Affiliations
            </h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "50px",
                flex: "0 1 auto",
              }}
            >
              <a
                href="https://www.mass.gov/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
                aria-label="Visit Massachusetts Government website"
              >
                <img
                  src="/images/stateseal-color.png"
                  alt="Massachusetts State Seal"
                  style={{ width: "100px", height: "auto" }}
                />
              </a>
              <a
                href="https://burnes.northeastern.edu/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
                aria-label="Visit Burnes Center for Social Change at Northeastern University"
              >
                <img
                  src="/images/burnesLogo.png"
                  alt="Burnes Center for Social Change Logo"
                  style={{ width: "200px", height: "auto" }}
                />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
