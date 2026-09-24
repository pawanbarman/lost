import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { readJson } from "../_shared/body.ts";
import { validate } from "../_shared/validate.ts";
import { authenticate } from "../_shared/auth.ts";
import { generateToken } from "../_shared/jwt.ts";
import { registerSchema, loginSchema } from "../validators/auth.ts";
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

export default router;