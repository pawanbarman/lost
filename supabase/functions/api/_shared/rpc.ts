import { db } from "./db.ts";
import { ApiError } from "./error.ts";

interface Envelope {
  ok?: boolean;
  status?: number;
  error?: string;
}

// Invoke a SECURITY DEFINER RPC and translate its `{ok:false, status, error}`
// envelope into an ApiError. Only throws on an ok:false envelope or transport
// error; otherwise returns the leftover data.
export async function rpcCall<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw error;

  // Scalar-returning RPCs (dashboard_stats, users_with_report_counts) hand back
  // the jsonb value directly — an array for the latter.
  if (Array.isArray(data)) return data as T;

  if (data !== null && typeof data === "object" && "ok" in data) {
    const envelope = data as unknown as Envelope;
    if (envelope.ok !== true) {
      throw new ApiError(envelope.error ?? "Request failed", envelope.status ?? 400);
    }
    const { ok: _ok, status: _status, error: _error, ...rest } = envelope;
    return rest as T;
  }
  return data as T;
}