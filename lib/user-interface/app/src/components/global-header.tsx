import {
  ButtonDropdownProps,
  TopNavigation,
} from "@cloudscape-design/components";
import { Mode } from "@cloudscape-design/global-styles";
import { useEffect, useState } from "react";
import { StorageHelper } from "../common/helpers/storage-helper";
import { Auth } from "aws-amplify";
import useOnFollow from "../common/hooks/use-on-follow";
import { CHATBOT_NAME } from "../common/constants";
import "./styles/global-header.css";
import { Divider } from "@aws-amplify/ui-react";
import { useNavigate } from "react-router-dom";

// Function to get brand banner height dynamically
const getBrandBannerHeight = (): number => {
  const bannerElement = document.querySelector(".ma__brand-banner");
  if (bannerElement) {
    return bannerElement.getBoundingClientRect().height;
  }
  return 40; // Default fallback height
};

const styles = {
  container: {
    "--color-background-top-navigation": "#0f1b2a", // Dark blue background
    "--color-text-top-navigation": "#ffffff", // White text
    "--color-background-top-navigation-hover": "#1f3b5a", // Slightly lighter blue for hover
  },
};

export default function GlobalHeader() {
  const onFollow = useOnFollow();
  const [userName, setUserName] = useState<string | null>(null);
  const [theme, setTheme] = useState<Mode>(StorageHelper.getTheme());
  const [isAdmin, setIsAdmin] = useState(false);
  const [brandBannerHeight, setBrandBannerHeight] = useState<number>(40);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const result = await Auth.currentAuthenticatedUser();
      if (!result || Object.keys(result).length === 0) {
        console.log("Signed out!");
        Auth.signOut();
        return;
      }

      // const userName = result?.attributes?.email;
      const name = result?.signInUserSession?.idToken?.payload?.name;
      const email = result?.signInUserSession?.idToken?.payload?.email;
      const userName = name ? name : email;
      setUserName(userName);

      // Check for admin role
      const adminRole =
        result?.signInUserSession?.idToken?.payload["custom:role"];
      setIsAdmin(adminRole && adminRole.includes("Admin"));
    })();
  }, []);

  // Monitor brand banner height changes (for when it expands/collapses)
  useEffect(() => {
    const updateBannerHeight = () => {
      const height = getBrandBannerHeight();
      setBrandBannerHeight(height);
    };

    // Initial measurement
    updateBannerHeight();

    // Watch for changes (e.g., when banner expands/collapses)
    const observer = new MutationObserver(updateBannerHeight);
    const bannerElement = document.querySelector(".ma__brand-banner");
    
    if (bannerElement) {
      observer.observe(bannerElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["class", "style"],
      });
    }

    // Also listen for resize events
    window.addEventListener("resize", updateBannerHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBannerHeight);
    };
  }, []);

  // const onChangeThemeClick = () => {
  //   if (theme === Mode.Dark) {
  //     setTheme(StorageHelper.applyTheme(Mode.Light));
  //   } else {
  //     setTheme(StorageHelper.applyTheme(Mode.Dark));
  //   }
  // };
  const onUserProfileClick = ({
    detail,
  }: {
    detail: ButtonDropdownProps.ItemClickDetails;
  }) => {
    if (detail.id === "signout") {
      Auth.signOut();
    } else if (detail.id === "dashboard") {
      navigate("/dashboard");
    }
  };

  return (
    <div
      style={{
        ...styles.container,
        zIndex: 1002,
        top: `${brandBannerHeight}px`, // Position below brand banner dynamically
        left: 0,
        right: 0,
        position: "fixed",
        backgroundColor: "#0073bb",
      }}
      className="awsui-context-top-navigation"
    >
      <TopNavigation
        identity={{
          href: "/",
          title: "GrantWell",
          logo: {
            src: "/images/stateseal-color.png",
            alt: "Massachusetts State Seal",
          },
        }}
        i18nStrings={{ searchIconAriaLabel: "Global header" }}
        utilities={[
          // {
          //   type: "button",
          //   // text: theme === Mode.Dark ? "Light Mode" : "Dark Mode",
          //   onClick: onChangeThemeClick,
          // },

          {
            type: "menu-dropdown",
            text: userName ?? "User",
            description: userName ?? "User menu",
            iconName: "user-profile",
            ariaLabel: userName ? `User menu for ${userName}` : "User menu",
            onItemClick: onUserProfileClick,
            items: [
              ...(isAdmin
                ? [
                    {
                      id: "dashboard",
                      text: "Dashboard",
                    },
                  ]
                : []),
              {
                id: "signout",
                text: "Sign out",
              },
            ],
            onItemFollow: onFollow,
          },
        ]}
      />
    </div>
  );
}
