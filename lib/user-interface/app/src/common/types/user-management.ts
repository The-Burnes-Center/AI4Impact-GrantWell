export type UserRolePreset = "user" | "admin" | "developer";

export const US_STATE_OPTIONS: readonly string[] = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
  "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
  "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];

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
