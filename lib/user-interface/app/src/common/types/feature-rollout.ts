export type FeatureRolloutMode = "all" | "allowlisted" | "disabled";

export interface FeatureAccessState {
  mode: FeatureRolloutMode;
  isAllowlisted: boolean;
  canUse: boolean;
}

export interface CurrentFeatureRolloutAccess {
  email: string;
  roles: string[];
  canManageFeatureRollouts: boolean;
  features: {
    aiGrantSearch: FeatureAccessState;
  };
}

export interface FeatureRolloutUser {
  email: string;
  grantedAt: string | null;
  grantedBy: string | null;
}

export interface FeatureRolloutConfig {
  featureKey: string;
  mode: FeatureRolloutMode;
  updatedAt: string | null;
  updatedBy: string | null;
  users: FeatureRolloutUser[];
}

export interface FeatureRolloutSearchUser {
  username: string;
  email: string;
  status: string;
  enabled: boolean;
  roles: string[];
  hasAccess: boolean;
}

export interface FeatureRolloutSearchResponse {
  featureKey: string;
  query: string;
  role: string;
  users: FeatureRolloutSearchUser[];
}
