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

  static getErrorMessage(error: any) {
    if (error.errors) {
      return error.errors.map((e: any) => e.message).join(", ");
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
   * Convert UTC date string to Eastern Time for display
   * @param utcDateString ISO date string in UTC
   * @returns Date object in Eastern Time (EDT or EST depending on DST)
   */
  static toEasternTime(utcDateString: string): Date {
    const utcDate = DateTime.fromISO(utcDateString, { zone: 'utc' });
    // 'America/New_York' automatically handles EDT/EST transitions
    const easternDate = utcDate.setZone('America/New_York');
    return easternDate.toJSDate();
  }

  /**
   * Format expiration date in Eastern Time for display
   * @param utcDateString ISO date string in UTC (or null)
   * @returns Formatted date string in Eastern Time, or null
   */
  static formatExpirationDate(utcDateString: string | null | undefined): string | null {
    if (!utcDateString) return null;
    const easternDate = Utils.toEasternTime(utcDateString);
    return easternDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Convert Eastern Time date input to UTC ISO string for storage
   * @param dateString Date string in format YYYY-MM-DD (local date in Eastern Time)
   * @returns ISO string in UTC, or null if input is empty
   */
  static easternDateToUTC(dateString: string): string | null {
    if (!dateString || dateString.trim() === '') return null;
    
    // Parse the date as Eastern Time at 23:59:59
    // 'America/New_York' automatically uses EDT or EST based on the date
    const easternDateTime = DateTime.fromISO(`${dateString}T23:59:59`, {
      zone: 'America/New_York'
    });
    
    // Convert to UTC and return ISO string
    return easternDateTime.toUTC().toISO();
  }

  /**
   * Convert UTC ISO string to Eastern Time date string for input fields
   * @param utcDateString ISO date string in UTC (or null)
   * @returns Date string in format YYYY-MM-DD (local date in Eastern Time), or empty string
   */
  static utcToEasternDateString(utcDateString: string | null | undefined): string {
    if (!utcDateString) return '';
    
    const easternDate = Utils.toEasternTime(utcDateString);
    // Format as YYYY-MM-DD
    const year = easternDate.getFullYear();
    const month = String(easternDate.getMonth() + 1).padStart(2, '0');
    const day = String(easternDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
