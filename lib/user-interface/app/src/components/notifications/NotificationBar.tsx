import { Alert } from "react-bootstrap";
import { useNotifications } from "./NotificationManager";

// Map notification types to Bootstrap Alert variants
const mapNotificationTypeToVariant = (type: string): string => {
  switch (type) {
    case "error":
      return "danger";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "info":
      return "info";
    default:
      return "info";
  }
};

const isUrgent = (type: string) => type === "error" || type === "warning";

export default function NotificationBar() {
  const { notifications } = useNotifications();

  // `transition={false}` is what lets the Alert's hardcoded role="alert" be dropped;
  // the enclosing live region is the single announcement source.
  const renderAlert = (notif: (typeof notifications)[number]) => (
    <Alert
      key={notif.id}
      variant={mapNotificationTypeToVariant(notif.type)}
      dismissible={notif.dismissible}
      onClose={() => notif.onDismiss()}
      className="mb-2"
      transition={false}
      role={undefined}
    >
      {notif.content}
    </Alert>
  );

  // Both regions stay mounted so a toast is an insertion into an existing live
  // region. Screen readers reliably miss a role="status" created with its text.
  // aria-atomic="false" overrides role="alert"'s implicit atomic, so a second
  // toast does not re-read the ones already on screen.
  return (
    <>
      <div role="alert" aria-live="assertive" aria-atomic="false">
        {notifications.filter((n) => isUrgent(n.type)).map(renderAlert)}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false">
        {notifications.filter((n) => !isUrgent(n.type)).map(renderAlert)}
      </div>
    </>
  );
}
