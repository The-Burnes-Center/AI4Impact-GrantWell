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
    color: '#1a4480',
    description: 'Federal government grants'
  },
  STATE: { 
    id: 'state', 
    label: 'State',
    color: '#2b7d3c',
    description: 'State-level government grants'
  },
  QUASI: { 
    id: 'quasi', 
    label: 'Quasi',
    color: '#7962a8',
    description: 'Quasi-governmental agency grants'
  },
  PHILANTHROPIC: { 
    id: 'philanthropic', 
    label: 'Philanthropic',
    color: '#af540b',
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
