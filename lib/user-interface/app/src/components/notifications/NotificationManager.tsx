import * as React from "react";
import { createContext, useState, useContext } from "react";
import { v4 as uuidv4 } from 'uuid';

interface Notification {
  id: string;
  type: string;
  content: string;
  date: number;
  dismissible: boolean;
  dismissLabel: string;
  onDismiss: () => void;
}

interface NotificationContextValue {
  notifications: Notification[];
  addNotification: (type: string, content: string) => string;
  removeNotification: (id: string) => void;
}

const defaultContextValue: NotificationContextValue = {
  notifications: [],
  addNotification: (_type: string, _content: string) => "",
  removeNotification: (_id: string) => {},
};

export const NotificationContext = createContext<NotificationContextValue>(defaultContextValue);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (type: string, content: string): string => {
    const id = uuidv4();

    setNotifications(prev => [...prev, {
      id: id,
      type: type,
      content: content,
      date: new Date().getTime(),
      dismissible: true,
      dismissLabel: "Hide notification",
      onDismiss: () => removeNotification(id)
    }]);    
    return id;
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => {
      const updatedNotifications = prev.filter(notif => notif.id !== id);
      return updatedNotifications;
    });
  };

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
