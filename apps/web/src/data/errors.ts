import type { ApiError } from '@gridrisk/shared';

export type DataAdapterErrorCode = ApiError['error']['code'];

/**
 * The one error type every DataAdapter rejects with, so the UI can branch on `code`
 * (e.g. CONFLICT → "already approved") without knowing whether it is in mock or live mode.
 * Codes mirror the API error body in docs/CONTRACTS.md.
 */
export class DataAdapterError extends Error {
  override readonly name = 'DataAdapterError';
  constructor(
    readonly code: DataAdapterErrorCode,
    message: string,
    /** HTTP status, when the error came from the API. */
    readonly status?: number,
  ) {
    super(message);
  }
}
