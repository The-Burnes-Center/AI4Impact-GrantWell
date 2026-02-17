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

export default function NotificationBar() {
  const { notifications } = useNotifications();

  return (
    <div>
      {notifications.map((notif) => (
        <Alert
          key={notif.id}
          variant={mapNotificationTypeToVariant(notif.type)}
          dismissible={notif.dismissible}
          onClose={() => notif.onDismiss()}
          className="mb-2"
        >
          {notif.content}
        </Alert>
      ))}
    </div>
  );
}
