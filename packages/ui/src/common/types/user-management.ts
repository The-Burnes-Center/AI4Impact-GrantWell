export type UserRolePreset = "user" | "admin" | "platformadmin" | "developer";

export {
  SUPPORTED_STATES,
  SUPPORTED_STATE_CODES,
  stateNameFromCode,
  stateCodeFromName,
  isSupportedStateCode,
} from "../states";
export type { SupportedStateCode } from "../states";

export interface ManagedUser {
  username: string;
  email: string;
  status: string;
  enabled: boolean;
  roles: string[];
  state: string;
}

export interface ManagedUsersResponse {
  users: ManagedUser[];
  nextPaginationToken: string | null;
  pageSize: number;
}
