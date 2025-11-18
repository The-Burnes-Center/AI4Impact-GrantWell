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
  const [showHowToModal, setShowHowToModal] = useState(false);

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

  const containerStyle: CSSProperties = {
    maxWidth: "950px",
    margin: "0 auto",
    padding: "0 40px",
    marginTop: "70px",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    paddingBottom: "0",
  };

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
    color: "#aaaaaa",
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

      setDocuments(
        folders.map((document) => ({
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
          <div
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
            }}
            role="button"
            tabIndex={0}
            aria-label={`View ${nofo.label}`}
            onClick={() =>
              handleNOFOSelect(
                `/landing-page/basePage/checklists/${encodeURIComponent(
                  nofo.value
                )}`,
                nofo
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleNOFOSelect(
                  `/landing-page/basePage/checklists/${encodeURIComponent(
                    nofo.value
                  )}`,
                  nofo
                );
              }
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.15)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
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
          </div>
        ))
      ) : (
        <p
          style={{
            gridColumn: "span 3", // Span all 3 columns
            color: "#6c757d",
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
            <h1
              style={{
                fontSize: titleFontSize,
                margin: 1,
                color: mainTextColor,
              }}
            >
              {title}
            </h1>
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
        {linkUrl ? (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {content}
          </a>
        ) : (
          content
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
        {
          title: "Federal Grant Application Resources",
          href: "https://www.mass.gov/lists/federal-funds-grant-application-resources",
          description: "Access categorized grant resources on mass.gov.",
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
            style={linkStyle}
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
          </a>
          <div
            style={{
              fontSize: "14px",
              color: bodyTextColor,
              textAlign: "center",
            }}
          >
            {resource.description}
          </div>
        </div>
      ))}
    </div>
  );

  // **Render**
  return (
    <div style={containerStyle}>
      <main
        style={{
          maxWidth: "950px",
          margin: "0 auto",
          padding: "0 40px",
          marginTop: "20px",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "0",
        }}
      >
        {/* Header Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
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

        {/* CTA Buttons or Instructions */}
        {selectedDocument ? (
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
                e.currentTarget.style.outline = "3px solid #FFB700";
                e.currentTarget.style.outlineOffset = "2px";
                e.currentTarget.style.boxShadow = "0 0 0 4px rgba(255, 183, 0, 0.2)";
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
                e.currentTarget.style.outline = "3px solid #FFB700";
                e.currentTarget.style.outlineOffset = "2px";
                e.currentTarget.style.boxShadow = "0 0 0 4px rgba(255, 183, 0, 0.2)";
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
                e.currentTarget.style.outline = "3px solid #FFB700";
                e.currentTarget.style.outlineOffset = "2px";
                e.currentTarget.style.boxShadow = "0 0 0 4px rgba(255, 183, 0, 0.2)";
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
        ) : (
          <div
            style={{
              margin: "28px auto 8px auto",
              padding: "20px 30px",
              maxWidth: "600px",
              textAlign: "center",
              backgroundColor: "#f0f7ff",
              border: "2px solid #0073BB",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0, 115, 187, 0.1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "10px",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ marginRight: "10px" }}
              >
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="#0073BB"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="#0073BB"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="#0073BB"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#006499",
                }}
              >
                Get Started
              </span>
            </div>
            <p
              style={{
                fontSize: "15px",
                color: "#333",
                margin: "0",
                lineHeight: "1.6",
              }}
            >
              Enter your query to find available funding opportunities (NOFOs),
              review key requirements, and receive writing support through
              Grantwell.
            </p>
          </div>
        )}

        {/* How to Use hover bar */}
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "center",
            marginTop: "10px",
          }}
          onMouseEnter={() => setShowHowToModal(true)}
          onMouseLeave={() => setShowHowToModal(false)}
        >
          <button
            onClick={() => setShowHowToModal(!showHowToModal)}
            style={{
              background: "none",
              border: "none",
              color: "#0073BB",
              fontSize: "14px",
              cursor: "pointer",
              padding: "5px 10px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#005A94";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#0073BB";
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M12 8L12 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M12 18.01L12.01 17.9989"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            How to use?
          </button>

          {showHowToModal && (
            <div
              style={{
                position: "absolute",
                top: "32px",
                right: "50%",
                transform: "translateX(50%)",
                minWidth: "320px",
                maxWidth: "500px",
                background: "#fff",
                border: "1px solid #e0e0e0",
                borderRadius: "10px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.13)",
                padding: "20px 20px 16px 20px",
                zIndex: 1000,
                fontSize: "13px",
                color: "#444",
                animation: "fadeIn 0.2s",
              }}
              role="dialog"
              aria-modal="true"
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    color: "#0073BB",
                    fontSize: "14px",
                  }}
                >
                  How to Use?
                </span>
              </div>
              <div
                style={{
                  background: "#f6fafd",
                  border: "1px solid #e0e0e0",
                  borderRadius: "7px",
                  color: "#0073BB",
                  fontWeight: 500,
                  fontSize: "13.5px",
                  padding: "10px 12px",
                  marginBottom: "12px",
                  textAlign: "center",
                }}
              >
                Select a grant to unlock features above
              </div>
              <ul
                style={{
                  margin: "10px 0 0 18px",
                  padding: 0,
                  color: "#666",
                  fontSize: "12.5px",
                  lineHeight: 1.7,
                }}
              >
                <li>
                  <b style={{ color: "#0073BB" }}>View Key Requirements:</b>{" "}
                  View summary of eligibility, required documents, narrative
                  sections, and deadlines for the selected grant.
                </li>
                <li>
                  <b style={{ color: "#0073BB" }}>Write Project Narrative:</b>{" "}
                  Open the editor to draft and edit your grant application
                  narrative.
                </li>
                <li>
                  <b style={{ color: "#0073BB" }}>Get Grant Help:</b> Open the
                  GrantWell AI chatbot to ask questions about the grant.
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Add spacing before next section */}
        <div style={{ marginBottom: "20px" }} />

        <ContentBox backgroundColor="#F6FCFF">
          <HistoryPanel />
        </ContentBox>

        <div style={{ flex: 1 }} />

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
      </main>

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
              >
                <img
                  src="/images/stateseal-color.png"
                  alt="State Seal"
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
              >
                <img
                  src="/images/burnesLogo.png"
                  alt="Burnes Center Logo"
                  style={{ width: "200px", height: "auto" }}
                />
              </a>
            </div>
          </div>
        </div>
        
        {/* Creative Commons License */}
        <InfoBanner
          title=""
          height="100px"
          imageSrc="/images/creativeCommons.png"
          imageAlt="Creative Commons"
          description="This work is licensed under a Creative Commons Attribution-ShareAlike 4.0 International License"
          linkUrl={"https://creativecommons.org/licenses/by-sa/4.0/"}
          backgroundColor="#000000"
          titleFontSize="16px"
          imagePosition="left"
          imageWidth="75px"
          titleAlign="center"
        />
      </footer>
    </div>
  );
}
