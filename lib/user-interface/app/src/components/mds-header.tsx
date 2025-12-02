import { useEffect, useState } from "react";

// Function to get brand banner + global header height dynamically
const getTopOffset = (): number => {
  const bannerElement = document.querySelector(".ma__brand-banner");
  const headerElement = document.querySelector(".awsui-context-top-navigation");
  
  let bannerHeight = 40; // Default fallback
  let headerHeight = 56; // Default fallback
  
  if (bannerElement) {
    bannerHeight = bannerElement.getBoundingClientRect().height;
  }
  
  if (headerElement) {
    headerHeight = headerElement.getBoundingClientRect().height;
  }
  
  return bannerHeight + headerHeight;
};

export default function MDSHeader() {
  const [topOffset, setTopOffset] = useState<number>(96); // Default: 40px banner + 56px header

  // Monitor brand banner + global header height changes
  useEffect(() => {
    const updateTopOffset = () => {
      const offset = getTopOffset();
      setTopOffset(offset);
    };

    // Initial calculation
    updateTopOffset();

    // Watch for changes
    const observer = new MutationObserver(updateTopOffset);
    const bannerElement = document.querySelector(".ma__brand-banner");
    
    if (bannerElement) {
      observer.observe(bannerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    // Also observe header changes
    const headerElement = document.querySelector(".awsui-context-top-navigation");
    if (headerElement) {
      observer.observe(headerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    window.addEventListener("resize", updateTopOffset);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateTopOffset);
    };
  }, []);

  return (
    <div 
      className="ma__header_slim"
      style={{
        position: "fixed",
        top: `${topOffset}px`,
        left: 0,
        right: 0,
        zIndex: 1001,
      }}
    >
      <header className="ma__header_slim__header" id="header">
        <div className="ma__header_slim__header-container ma__container">
          <div className="ma__header_slim__logo">
            <div className="ma__site-logo">
              <a href="https://www.mass.gov/">
                <img
                  className="ma__image"
                  src="https://unpkg.com/@massds/mayflower-assets@14.1.0/static/images/logo/stateseal.png"
                  width="45"
                  height="45"
                  alt="Mass.gov homepage"
                />
                <span aria-hidden="true">Mass.gov</span>
              </a>
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}

