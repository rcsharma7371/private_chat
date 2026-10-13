export const ROOM_STATES = {
  AVAILABLE: 'AVAILABLE',
  AWAITING_CODE: 'AWAITING_CODE',
  PROTECTED: 'PROTECTED',
} as const;

export type RoomState = (typeof ROOM_STATES)[keyof typeof ROOM_STATES];

export const MAX_PARTICIPANTS = 2;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const SESSION_TOKEN_EXPIRY = '15m';
export const DEFAULT_UNCLAIMED_LINK_TTL_HOURS = 24;
export const ROOM_INACTIVITY_MAX_DAYS = 30;

export const DISAPPEARING_OPTIONS = [
  { label: 'Off', seconds: 0 },
  { label: '1 minute', seconds: 60 },
  { label: '1 hour', seconds: 3600 },
  { label: '24 hours', seconds: 86400 },
  { label: '7 days', seconds: 604800 },
] as const;

export const SLUG_REGEX = /^[a-z0-9-]{6,40}$/;

export const RESERVED_SLUGS = new Set([
  'admin',
  'administrator',
  'api',
  'turn',
  'stun',
  'auth',
  'status',
  'health',
  'login',
  'logout',
  'signup',
  'register',
  'settings',
  'support',
  'help',
  'about',
  'contact',
  'privacy',
  'terms',
  'static',
  'assets',
  'socket',
  'socket.io',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
  'rooms',
  'messages',
  'call',
  'calls',
]);
