import {Auth} from 'aws-amplify'
import { DateTime } from "luxon";

export class Utils {
  // static isDevelopment() {
  //   return import.meta.env.MODE === "development";
  // }

  // eslint-disable-next-line @typescript-eslint/ban-types
  static isFunction(value: unknown): value is Function {
    return typeof value === "function";
  }

  static classNames(...classes: string[]) {
    return classes.filter(Boolean).join(" ");
  }

  static generateUUID() {
    if (crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    if (crypto && crypto.getRandomValues) {
      console.log(
        "crypto.randomUUID is not available using crypto.getRandomValues"
      );

      return ("" + [1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(
        /[018]/g,
        (ch) => {
          const c = Number(ch);
          return (
            c ^
            (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
          ).toString(16);
        }
      );
    }

    console.log("crypto is not available");
    let date1 = new Date().getTime();
    let date2 =
      (typeof performance !== "undefined" &&
        performance.now &&
        performance.now() * 1000) ||
      0;

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        let r = Math.random() * 16;
        if (date1 > 0) {
          r = (date1 + r) % 16 | 0;
          date1 = Math.floor(date1 / 16);
        } else {
          r = (date2 + r) % 16 | 0;
          date2 = Math.floor(date2 / 16);
        }

        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      }
    );
  }

  static delay(delay: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }

  static findElementInParents(element: HTMLElement | null, tagName: string) {
    let current: HTMLElement | null = element;
    while (current) {
      if (current.tagName === tagName) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  static getErrorMessage(error: unknown) {
    if (error && typeof error === "object" && "errors" in error && Array.isArray((error as { errors: unknown[] }).errors)) {
      return ((error as { errors: Array<{ message?: string }> }).errors)
        .map((e) => e.message ?? "")
        .join(", ");
    }

    return "Unknown error";
  }

  static urlSearchParamsToRecord(
    params: URLSearchParams
  ): Record<string, string> {
    const record: Record<string, string> = {};

    for (const [key, value] of params.entries()) {
      record[key] = value;
    }

    return record;
  }

  static bytesToSize(bytes: number): string {
    const sizes: string[] = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

    if (bytes === 0) return "0 MB";
    const i: number = parseInt(
      Math.floor(Math.log(bytes) / Math.log(1024)).toString()
    );

    const sizeStr = i >= sizes.length ? "" : sizes[i];
    return Math.round(bytes / Math.pow(1024, i)) + " " + sizeStr;
  }

  static textEllipsis(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + "...";
  }

  static isValidURL(value: string) {
    if (value.length === 0 || value.indexOf(" ") !== -1) {
      return false;
    }

    const result = value.match(
      /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/gi
    );

    return result !== null;
  }

  static async authenticate(): Promise<string> {
    try {
      let token = '';
      const currentUser = await Auth.currentAuthenticatedUser()
      token = currentUser.signInUserSession.idToken.jwtToken
      return token
    } catch (error) {
      console.error('Error getting current user session:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Get current timestamp in ISO format
   */
  static getCurrentTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Format a timestamp for display
   * @param timestamp ISO timestamp string
   * @returns Formatted date string
   */
  static formatTimestamp(timestamp: string): string {
    return DateTime.fromISO(timestamp).toLocaleString(DateTime.DATETIME_SHORT);
  }

  /**
   * Parse a timestamp string to ISO format
   * @param timestamp Timestamp string
   * @returns ISO formatted timestamp
   */
  static parseTimestamp(timestamp: string): string {
    return new Date(timestamp).toISOString();
  }

  /**
   * Format expiration date for display
   * Supports both formats:
   * - "YYYY-MM-DD" (new format)
   * - ISO date string (old format, e.g., "2026-03-13T23:59:59Z")
   * @param dateString Date string in YYYY-MM-DD or ISO format (or null)
   * @returns Formatted date string, or null
   */
  static formatExpirationDate(dateString: string | null | undefined): string | null {
    if (!dateString) return null;
    
    // Check if it's already in YYYY-MM-DD format (new format)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      // Parse YYYY-MM-DD format
      const [year, month, day] = dateString.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    
    // Otherwise, treat as ISO string (old format)
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date format: ${dateString}`);
      return null;
    }
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
}
