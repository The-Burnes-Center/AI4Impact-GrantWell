/**
 * Grant Type Definitions
 * 
 * Defines the available grant types for categorizing grants by their source.
 * Each grant can be assigned one type: Federal, State, Quasi, or Philanthropic.
 */

export const GRANT_TYPES = {
  FEDERAL: { 
    id: 'federal', 
    label: 'Federal', 
    color: 'var(--gw-color-category-1)',
    description: 'Federal government grants'
  },
  STATE: { 
    id: 'state', 
    label: 'State',
    color: 'var(--gw-color-category-2)',
    description: 'State-level government grants'
  },
  QUASI: { 
    id: 'quasi', 
    label: 'Quasi',
    color: 'var(--gw-color-category-3)',
    description: 'Quasi-governmental agency grants'
  },
  PHILANTHROPIC: { 
    id: 'philanthropic', 
    label: 'Philanthropic',
    color: 'var(--gw-color-category-4)',
    description: 'Private foundation and charitable organization grants'
  },
} as const;

export type GrantTypeId = 'federal' | 'state' | 'quasi' | 'philanthropic';

export interface GrantType {
  id: GrantTypeId;
  label: string;
  color: string;
  description: string;
}

/**
 * Get a grant type by its ID
 */
export const getGrantTypeById = (id: string): GrantType | undefined => {
  return Object.values(GRANT_TYPES).find(type => type.id === id);
};

/**
 * Get all grant types as an array
 */
export const getAllGrantTypes = (): GrantType[] => {
  return Object.values(GRANT_TYPES);
};

/**
 * Validate if a string is a valid grant type ID
 */
export const isValidGrantType = (id: string): id is GrantTypeId => {
  return ['federal', 'state', 'quasi', 'philanthropic'].includes(id);
};
