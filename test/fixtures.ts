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
