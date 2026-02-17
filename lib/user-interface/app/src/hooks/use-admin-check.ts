import { useState, useEffect } from "react";
import { Auth } from "aws-amplify";

/**
 * Checks whether the current authenticated user has the Admin role.
 *
 * Reads `custom:role` from the Cognito ID token and returns `true`
 * if the value includes "Admin".
 *
 * @returns `{ isAdmin, loading }` — `loading` is `true` while the
 * check is in progress.
 */
export function useAdminCheck(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        const adminRole =
          result?.signInUserSession?.idToken?.payload["custom:role"];
        if (!cancelled) {
          setIsAdmin(
            typeof adminRole === "string" && adminRole.includes("Admin")
          );
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    checkAdmin();

    return () => {
      cancelled = true;
    };
  }, []);

  return { isAdmin, loading };
}

export default useAdminCheck;
