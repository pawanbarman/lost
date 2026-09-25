import { HttpError, type Middleware } from "oak";

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

export function toErrorResponse(err: unknown): { status: number; body: { error: string } } {
  if (err instanceof ApiError) {
    return { status: err.statusCode, body: { error: err.message } };
  }

  if (err instanceof HttpError) {
    return { status: err.status, body: { error: err.message } };
  }

  if (err instanceof Error) {
    const name = err.name;

    if (name === "ZodError") {
      const asZod = err as { issues?: { message?: string }[]; errors?: { message?: string }[] };
      const message = asZod.issues?.[0]?.message ?? asZod.errors?.[0]?.message;
      return { status: 400, body: { error: message ?? "Invalid input" } };
    }

    if (name === "JWTExpired" || name === "TokenExpiredError") {
      return { status: 401, body: { error: "Token expired" } };
    }

    if (name === "JWTInvalid" || name === "JsonWebTokenError" || name === "JWTClaimValidationFailed") {
      return { status: 401, body: { error: "Invalid token" } };
    }

    if ("code" in err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002") {
        return { status: 400, body: { error: "A record with this information already exists" } };
      }
      if (code === "P2025") {
        return { status: 404, body: { error: "Record not found" } };
      }
      if (code === "LIMIT_FILE_SIZE") {
        return { status: 400, body: { error: "File too large. Maximum size is 5MB." } };
      }
      if (code === "23505") {
        return { status: 400, body: { error: "A record with this information already exists" } };
      }
      if (code === "PGRST116") {
        return { status: 404, body: { error: "Record not found" } };
      }
    }

    if (err.message && err.message.includes("Images only")) {
      return { status: 400, body: { error: err.message } };
    }
  }

  return { status: 500, body: { error: "Internal server error" } };
}

// Must be registered BEFORE all other middleware so HTTP errors bubble up and the
// response body still carries CORS/security headers set by downstream middleware.
export function errorHandler(): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      console.error("[Error]", err instanceof Error ? err.stack : err);
      const { status, body } = toErrorResponse(err);
      ctx.response.status = status;
      ctx.response.body = body;
    }
  };
}