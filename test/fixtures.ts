// ============================================
// ADDRESSES
// ============================================
export const ADDRESSES = {
  // Valid Ethereum addresses
  OWNER: '0x51a514d3f28ea19775e811fc09396e808394bd12',
  DEPLOYER: '0x6a327965be29a7acb83e1d1bbd689b72e188e58d',
  PLAYER: '0x1234567890abcdef1234567890abcdef12345678',

  // Short addresses for authorization tests
  UNAUTHORIZED: '0x123',
  AUTHORIZED: '0x456',
  ANOTHER_AUTHORIZED: '0x789',
  AUTHORITATIVE: '0xabc',
  OTHER: '0xdef',

  // Invalid addresses
  INVALID: 'invalid-address'
} as const

// ============================================
// WORLD NAMES
// ============================================
export const WORLD_NAMES = {
  DEFAULT: 'test-world.dcl.eth',
  FALLBACK: 'fallback.dcl.eth',
  WITH_SPECIAL_CHARS: 'test world/name'
} as const

// ============================================
// PARCELS
// ============================================
export const PARCELS = {
  DEFAULT: '0,0',
  SCENE_A: '10,20',
  SCENE_B: '30,40',
  GENESIS_CITY: '52,-10'
} as const

// ============================================
// PLACE IDS
// ============================================
export const PLACE_IDS = {
  DEFAULT: '830d885b-52f3-4c91-9151-9c8ec40aab63',
  SCENE_A: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  SCENE_B: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  GENESIS_CITY: 'c3d4e5f6-a7b8-9012-cdef-123456789012'
} as const
