import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Footer } from "@massds/mayflower-react";

export default function FooterComponent() {
  const navigate = useNavigate();
  const footerRef = useRef<HTMLDivElement>(null);

  // Intercept footer link clicks for React Router navigation
  useEffect(() => {
    const footer = footerRef.current || document.querySelector(".ma__footer-new");
    if (!footer) return;

    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLAnchorElement;
      if (target && target.tagName === "A" && target.href) {
        try {
          const url = new URL(target.href);
          const pathname = url.pathname;
          // Only intercept internal links (same origin)
          if (pathname.startsWith("/") && url.origin === window.location.origin) {
            e.preventDefault();
            navigate(pathname);
          }
        } catch (err) {
          // If URL parsing fails, allow default behavior
        }
      }
    };

    footer.addEventListener("click", handleLinkClick);

    return () => {
      footer.removeEventListener("click", handleLinkClick);
    };
  }, [navigate]);

  return (
    <div
      ref={footerRef}
      style={{ position: "static", width: "100%" }}
    >
      <Footer
        footerLinks={{
          links: [
            {
              href: "https://www.mass.gov/topics/massachusetts-topics",
              text: "All Topics",
            },
            {
              href: "https://www.mass.gov/massgov-site-policies",
              text: "Site Policies",
            },
            {
              href: "https://www.mass.gov/topics/public-records-requests",
              text: "Public Records Requests",
            },
            {
              href: "https://www.mass.gov/info-details/commonwealth-of-massachusetts-executive-department-digital-accessibility-statement",
              text: "Accessibility Statement",
            },
          ],
        }}
        footerLogo={{
          src: "https://unpkg.com/@massds/mayflower-assets@14.1.0/static/images/logo/stateseal.png",
          domain: "/",
          title: "GrantWell home page",
        }}
        footerText={{
          copyright: new Date().getFullYear().toString(),
          privacyPolicy: {
            text: "Mass.gov Privacy Policy",
            url: "https://www.mass.gov/privacypolicy",
          },
        }}
      />
    </div>
  );
}

