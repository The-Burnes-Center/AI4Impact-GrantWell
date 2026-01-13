import {
  Flashbar
} from "@cloudscape-design/components";
import { useNotifications } from "./notif-manager";

export default function NotificationBar() {

  const { notifications, addNotification } = useNotifications();
  

  return (  
    <div>
    <Flashbar  items={notifications.map(notif => ({
        content: notif.content,
        dismissible: notif.dismissible,
        // sticky : true,
        onDismiss: () => notif.onDismiss(),
        type: notif.type
      }))} />    
      </div>  
  );
}
