/**
 * BURNRATE Rate Limiting
 * In-memory rate limiter with sliding window
 */

import { Context, Next } from 'hono';
import { RateLimitError, ErrorCodes } from './errors.js';
import { TIER_LIMITS, SubscriptionTier } from '../core/types.js';

// ============================================================================
// RATE LIMIT STORE
// ============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory store (use Redis in production for horizontal scaling)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart > windowMs * 2) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000);

// ============================================================================
// RATE LIMIT CONFIG
// ============================================================================

interface RateLimitConfig {
  windowMs: number;      // Window size in ms
  maxRequests: number;   // Max requests per window
  keyGenerator: (c: Context) => string;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000,   // 1 minute
  maxRequests: 100,      // 100 requests per minute
  keyGenerator: (c) => {
    // Use API key if available, otherwise IP
    const apiKey = c.req.header('X-API-Key');
    if (apiKey) return `api:${apiKey}`;

    const forwarded = c.req.header('X-Forwarded-For');
    const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
    return `ip:${ip}`;
  }
};

// Tier-based limits (requests per minute)
const TIER_RATE_LIMITS: Record<SubscriptionTier, number> = {
  freelance: 60,
  operator: 120,
  command: 300
};

// ============================================================================
// RATE LIMIT MIDDLEWARE
// ============================================================================

export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const { windowMs, maxRequests, keyGenerator } = { ...DEFAULT_CONFIG, ...config };

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Start new window if needed
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
    }

    entry.count++;
    rateLimitStore.set(key, entry);

    // Check limit
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      throw new RateLimitError(
        ErrorCodes.RATE_LIMITED,
        `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter
      );
    }

    // Add rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + windowMs) / 1000)));

    await next();
  };
}

// ============================================================================
// TIER-AWARE RATE LIMIT
// ============================================================================

/**
 * Rate limiter that adjusts based on player tier
 * Must be used AFTER auth middleware (requires player in context)
 */
export function tierRateLimitMiddleware() {
  const windowMs = 60 * 1000; // 1 minute

  return async (c: Context, next: Next) => {
    const player = c.get('player' as never) as { id: string; tier: SubscriptionTier } | undefined;

    // If no player (public endpoint), use base rate
    if (!player) {
      return rateLimitMiddleware({ maxRequests: 30 })(c, next);
    }

    const key = `player:${player.id}`;
    const maxRequests = TIER_RATE_LIMITS[player.tier] || TIER_RATE_LIMITS.freelance;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
    }

    entry.count++;
    rateLimitStore.set(key, entry);

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      throw new RateLimitError(
        ErrorCodes.RATE_LIMITED,
        `Rate limit exceeded (${player.tier} tier: ${maxRequests}/min). Try again in ${retryAfter}s.`,
        retryAfter
      );
    }

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + windowMs) / 1000)));

    await next();
  };
}

// ============================================================================
// WRITE OPERATION LIMITER
// ============================================================================

const writeStore = new Map<string, RateLimitEntry>();

/**
 * Stricter rate limit for write operations (mutations)
 * 10 writes per minute for freelance, scaling up
 */
export function writeRateLimitMiddleware() {
  const windowMs = 60 * 1000;
  const baseLimits: Record<SubscriptionTier, number> = {
    freelance: 20,
    operator: 40,
    command: 100
  };

  return async (c: Context, next: Next) => {
    const player = c.get('player' as never) as { id: string; tier: SubscriptionTier } | undefined;

    if (!player) {
      await next();
      return;
    }

    const key = `write:${player.id}`;
    const maxRequests = baseLimits[player.tier] || baseLimits.freelance;
    const now = Date.now();

    let entry = writeStore.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 0, windowStart: now };
    }

    entry.count++;
    writeStore.set(key, entry);

    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      throw new RateLimitError(
        ErrorCodes.RATE_LIMITED,
        `Write rate limit exceeded. Try again in ${retryAfter}s.`,
        retryAfter
      );
    }

    await next();
  };
}
