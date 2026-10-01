import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { readJson } from "../_shared/body.ts";
import { validate } from "../_shared/validate.ts";
import { authenticate } from "../_shared/auth.ts";
import { generateToken } from "../_shared/jwt.ts";
import { generateResetToken, verifyResetToken } from "../_shared/jwt.ts";
import { isEmailConfigured, sendPasswordReset } from "../_shared/email.ts";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.ts";
import { hashPassword, comparePassword } from "../_shared/bcrypt.ts";

const router = new Router({ prefix: "/api/auth" });

router.post("/register", async (ctx) => {
  const validatedData = validate(registerSchema, await readJson<unknown>(ctx));

  const { data: existing, error: existingError } = await db()
    .from("User")
    .select("id")
    .eq("email", validatedData.email)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Email already registered" };
    return;
  }

  const passwordHash = await hashPassword(validatedData.password, 10);

  const { data: user, error } = await db()
    .from("User")
    .insert({
      id: crypto.randomUUID(),
      name: validatedData.name,
      email: validatedData.email,
      phone: validatedData.phone ?? null,
      passwordHash,
      updatedAt: new Date().toISOString(),
    })
    .select("id,name,email,role,createdAt")
    .single();
  if (error) throw error;

  const token = await generateToken(user.id);

  ctx.response.status = 201;
  ctx.response.body = { user, token };
});

router.post("/login", async (ctx) => {
  const validatedData = validate(loginSchema, await readJson<unknown>(ctx));

  const { data: user, error } = await db()
    .from("User")
    .select("id,name,email,role,passwordHash")
    .eq("email", validatedData.email)
    .maybeSingle();
  if (error) throw error;

  if (!user) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid credentials" };
    return;
  }

  const isValidPassword = await comparePassword(validatedData.password, user.passwordHash);
  if (!isValidPassword) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid credentials" };
    return;
  }

  const token = await generateToken(user.id);

  ctx.response.body = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  };
});

router.get("/me", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const { data, error } = await db()
    .from("User")
    .select("id,name,email,phone,role,createdAt")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;

  ctx.response.body = data;
});

router.post("/forgot-password", async (ctx) => {
  const validatedData = validate(forgotPasswordSchema, await readJson<unknown>(ctx));

  // Fail closed before any token exists. Without a delivery channel the only way to
  // hand the token back is in this response body, which lets anyone who knows a
  // registered email take over that account. Refuse instead of leaking.
  if (!isEmailConfigured()) {
    ctx.response.status = 503;
    ctx.response.body = {
      error: "Password reset is unavailable. Please contact support.",
    };
    return;
  }

  const { data: user, error } = await db()
    .from("User")
    .select("id,email")
    .eq("email", validatedData.email)
    .maybeSingle();
  if (error) throw error;

  if (user) {
    const resetToken = await generateResetToken(user.id);
    const delivered = await sendPasswordReset(user.email ?? validatedData.email, resetToken);
    if (!delivered) {
      console.error("[Auth] password reset email not delivered for user", user.id);
    }
  }

  ctx.response.body = {
    message: "If that email is registered, a password reset link has been sent.",
  };
});

router.post("/reset-password", async (ctx) => {
  const validatedData = validate(resetPasswordSchema, await readJson<unknown>(ctx));

  let reset;
  try {
    reset = await verifyResetToken(validatedData.token);
  } catch {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid or expired reset token" };
    return;
  }

  const { data: user, error } = await db()
    .from("User")
    .select("id")
    .eq("id", reset.userId)
    .maybeSingle();
  if (error) throw error;

  if (!user) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid or expired reset token" };
    return;
  }

  const passwordHash = await hashPassword(validatedData.password, 10     );

  const { error: updateError } = await db()
    .from("User")
    .update({ passwordHash, updatedAt: new Date().toISOString() })
    .eq("id", user.id);
  if (updateError) throw updateError;

  ctx.response.body = { message: "Password updated. You can now log in with your new password." };
});

export default router;