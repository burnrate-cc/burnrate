/**
 * BURNRATE API Error Handling
 * Standardized error responses
 */

import { Context } from 'hono';
import { ZodError } from 'zod';
import { v4 as uuid } from 'uuid';

// ============================================================================
// ERROR CODES
// ============================================================================

export const ErrorCodes = {
  // Authentication
  MISSING_API_KEY: 'MISSING_API_KEY',
  INVALID_API_KEY: 'INVALID_API_KEY',
  INSUFFICIENT_TIER: 'INSUFFICIENT_TIER',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Rate Limiting
  RATE_LIMITED: 'RATE_LIMITED',
  DAILY_LIMIT_REACHED: 'DAILY_LIMIT_REACHED',
  TICK_RATE_LIMITED: 'TICK_RATE_LIMITED',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ZONE_NOT_FOUND: 'ZONE_NOT_FOUND',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  UNIT_NOT_FOUND: 'UNIT_NOT_FOUND',
  SHIPMENT_NOT_FOUND: 'SHIPMENT_NOT_FOUND',
  CONTRACT_NOT_FOUND: 'CONTRACT_NOT_FOUND',
  FACTION_NOT_FOUND: 'FACTION_NOT_FOUND',

  // Permissions
  NOT_YOUR_RESOURCE: 'NOT_YOUR_RESOURCE',
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
  NOT_IN_FACTION: 'NOT_IN_FACTION',
  ALREADY_IN_FACTION: 'ALREADY_IN_FACTION',

  // Game State
  WRONG_ZONE_TYPE: 'WRONG_ZONE_TYPE',
  WRONG_LOCATION: 'WRONG_LOCATION',
  INSUFFICIENT_RESOURCES: 'INSUFFICIENT_RESOURCES',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  NO_ROUTE: 'NO_ROUTE',
  UNIT_BUSY: 'UNIT_BUSY',
  LICENSE_REQUIRED: 'LICENSE_REQUIRED',

  // Conflicts
  NAME_TAKEN: 'NAME_TAKEN',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // State
  INVALID_STATE: 'INVALID_STATE',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class GameError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export class ValidationError extends GameError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCodes.VALIDATION_ERROR, message, 400, details);
    this.name = 'ValidationError';
  }

  static fromZod(error: ZodError): ValidationError {
    const issues = error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message
    }));
    return new ValidationError('Validation failed', { issues });
  }
}

export class AuthError extends GameError {
  constructor(code: ErrorCode, message: string) {
    super(code, message, 401);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends GameError {
  constructor(resource: string, id?: string) {
    super(
      ErrorCodes.NOT_FOUND,
      id ? `${resource} '${id}' not found` : `${resource} not found`,
      404
    );
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends GameError {
  constructor(
    code: ErrorCode,
    message: string,
    public retryAfter?: number
  ) {
    super(code, message, 429, retryAfter ? { retryAfter } : undefined);
    this.name = 'RateLimitError';
  }
}

export class PermissionError extends GameError {
  constructor(message: string, code: ErrorCode = ErrorCodes.INSUFFICIENT_PERMISSION) {
    super(code, message, 403);
    this.name = 'PermissionError';
  }
}

export class ConflictError extends GameError {
  constructor(message: string, code: ErrorCode = ErrorCodes.CONFLICT) {
    super(code, message, 409);
    this.name = 'ConflictError';
  }
}

// ============================================================================
// ERROR RESPONSE HELPER
// ============================================================================

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

export function errorResponse(
  c: Context,
  error: GameError | Error,
  requestId?: string
): Response {
  const rid = requestId || uuid().slice(0, 8);

  if (error instanceof GameError) {
    const response: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        requestId: rid
      }
    };

    if (error.details) {
      response.error.details = error.details;
    }

    const headers: Record<string, string> = {};
    if (error instanceof RateLimitError && error.retryAfter) {
      headers['Retry-After'] = String(error.retryAfter);
    }

    return c.json(response, error.statusCode as any, headers);
  }

  // Unknown error - log it but don't expose details
  console.error(`[${rid}] Internal error:`, error);

  return c.json({
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An internal error occurred',
      requestId: rid
    }
  }, 500);
}

// ============================================================================
// VALIDATION HELPER
// ============================================================================

import { z, ZodSchema } from 'zod';

export async function validateBody<T>(
  c: Context,
  schema: ZodSchema<T>
): Promise<T> {
  try {
    const body = await c.req.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw ValidationError.fromZod(error);
    }
    if (error instanceof SyntaxError) {
      throw new ValidationError('Invalid JSON body');
    }
    throw error;
  }
}
