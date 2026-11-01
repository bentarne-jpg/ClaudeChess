import type { ApiErrorCode } from "@sjakk/contracts";

const STATUS: Record<ApiErrorCode, number> = {
  "bad-request": 400, "unauthorized": 401, "not-found": 404, "conflict": 409, "rate-limited": 429,
  "no-profile": 409, "not-solved": 400, "illegal-game": 400, "server-error": 500,
};
export class ApiError extends Error {
  readonly status: number;
  constructor(public code: ApiErrorCode, message?: string) { super(message ?? code); this.status = STATUS[code]; }
}
