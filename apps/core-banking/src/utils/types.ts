
// ─────────────────────────────────────────────────────────────
// SHARED SERVICE RESPONSE TYPES
// Discriminated union so callers get proper type narrowing:
//   if (result.success) { result.data ... }  ← TypeScript knows data exists
//   if (!result.success) { result.error ... } ← TypeScript knows error exists
// ─────────────────────────────────────────────────────────────

export type ServiceSuccess<T> = { success: true; data: T };
export type ServiceError = { success: false; error: string; details?: unknown };
export type ServiceResult<T> = ServiceSuccess<T> | ServiceError;
