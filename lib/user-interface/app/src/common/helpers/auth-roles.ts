export function parseRoleClaim(rawRoleClaim: unknown): string[] {
  if (Array.isArray(rawRoleClaim)) {
    return rawRoleClaim.filter((role): role is string => typeof role === "string");
  }

  if (typeof rawRoleClaim !== "string" || rawRoleClaim.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawRoleClaim);
    if (Array.isArray(parsed)) {
      return parsed.filter((role): role is string => typeof role === "string");
    }
  } catch {
    return [rawRoleClaim];
  }

  return [];
}

export function hasRole(roles: string[], role: string): boolean {
  return roles.includes(role);
}
