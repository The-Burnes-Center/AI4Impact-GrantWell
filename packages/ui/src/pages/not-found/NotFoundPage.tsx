import { usePageTitle } from "../../common/page-title";
import PageMessage from "../../components/common/PageMessage";

export default function NotFoundPage() {
  usePageTitle("Page not found");

  return (
    <PageMessage
      title="Page not found"
      message="The link may be old or mistyped. Check the address, or find grants on the home page."
      action={{ label: "Go to home", to: "/home" }}
    />
  );
}
