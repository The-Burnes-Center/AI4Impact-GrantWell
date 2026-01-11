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
import { useNavigate } from "react-router-dom";

const styles = {
  container: {
    "--color-background-top-navigation": "#14558F", // Mayflower utility bar color
    "--color-text-top-navigation": "#ffffff", // White text
    "--color-background-top-navigation-hover": "#104472", // Slightly lighter blue for hover
  },
};

export default function GlobalHeader() {
  const onFollow = useOnFollow();
  const [userName, setUserName] = useState<string | null>(null);
  const [theme, setTheme] = useState<Mode>(StorageHelper.getTheme());
  const [isAdmin, setIsAdmin] = useState(false);
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
    }
  };

  return (
    <div
      style={{
        ...styles.container,
        position: "static",
        backgroundColor: "#14558F",
        height: "40px",
        minHeight: "40px",
        maxHeight: "40px",
        width: "100%",
      }}
      className="awsui-context-top-navigation"
    >
      <div style={{ height: "40px", minHeight: "40px", maxHeight: "40px" }}>
        <TopNavigation
          identity={{
            href: "/",
            title: "GrantWell",
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
              iconName: "user-profile",
              ariaLabel: userName ? `User menu for ${userName}` : "User menu",
              onItemClick: onUserProfileClick,
              items: [
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
    </div>
  );
}
