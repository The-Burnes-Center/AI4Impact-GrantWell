import { useState, useEffect } from "react";
import { Auth } from "aws-amplify";
import { hasRole, parseRoleClaim } from "../common/helpers/auth-roles";

export function useAdminCheck(): {
  isAdmin: boolean;
  isDeveloper: boolean;
  isStateAdmin: boolean;
  isRegularAdmin: boolean;
  userState: string;
  roles: string[];
  loading: boolean;
} {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [isStateAdmin, setIsStateAdmin] = useState(false);
  const [isRegularAdmin, setIsRegularAdmin] = useState(false);
  const [userState, setUserState] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkAdmin = async () => {
      try {
        const result = await Auth.currentAuthenticatedUser();
        const payload = result?.signInUserSession?.idToken?.payload || {};
        const parsedRoles = parseRoleClaim(payload["custom:role"]);
        const stateClaim = String(payload["custom:state"] || "").trim().toUpperCase();
        const hasDeveloperRole = hasRole(parsedRoles, "Developer");
        const hasAdminRole = hasRole(parsedRoles, "Admin");
        if (!cancelled) {
          setRoles(parsedRoles);
          setUserState(stateClaim);
          setIsAdmin(hasAdminRole || hasDeveloperRole);
          setIsDeveloper(hasDeveloperRole);
          setIsStateAdmin(hasAdminRole && !hasDeveloperRole && !!stateClaim);
          setIsRegularAdmin(hasAdminRole && !hasDeveloperRole && !stateClaim);
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
          setIsDeveloper(false);
          setIsStateAdmin(false);
          setIsRegularAdmin(false);
          setUserState("");
          setRoles([]);
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

  return { isAdmin, isDeveloper, isStateAdmin, isRegularAdmin, userState, roles, loading };
}

export default useAdminCheck;
