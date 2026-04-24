export type UserRolePreset = "user" | "admin" | "developer";

export {
  SUPPORTED_STATES,
  SUPPORTED_STATE_CODES,
  stateNameFromCode,
  stateCodeFromName,
  isSupportedStateCode,
} from "../generated/states";
export type { SupportedStateCode } from "../generated/states";

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
