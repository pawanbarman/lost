import { RESET_TTL_SECONDS } from "./jwt.ts";
import { sendMail, type SmtpConfig } from "./smtp.ts";

const DEFAULT_SMTP_PORT = 587;
const IMPLICIT_TLS_PORT = 465;
const SUBJECT = "Reset your Lost & Found password";

// Read at call time rather than from _shared/env.ts, which snapshots the
// environment at import and would make this untestable.
function readEnv(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

/**
 * A relay with no credentials is legitimate (a trusted sidecar), but a half-set
 * pair is always a typo, so user and pass must be present together or not at all.
 */
export function isEmailConfigured(): boolean {
  if (!readEnv("SMTP_HOST") || !readEnv("MAIL_FROM") || !readEnv("APP_URL")) {
    return false;
  }
  return Boolean(readEnv("SMTP_USER")) === Boolean(readEnv("SMTP_PASS"));
}

function smtpConfig(): SmtpConfig | null {
  const host = readEnv("SMTP_HOST");
  const from = readEnv("MAIL_FROM");
  if (!host || !from || !readEnv("APP_URL")) return null;

  const user = readEnv("SMTP_USER");
  const pass = readEnv("SMTP_PASS");
  if (Boolean(user) !== Boolean(pass)) return null;

  const parsedPort = Number(readEnv("SMTP_PORT"));
  const port = Number.isFinite(parsedPort) && parsedPort > 0
    ? parsedPort
    : DEFAULT_SMTP_PORT;

  const secureFlag = readEnv("SMTP_SECURE").toLowerCase();
  const secure = secureFlag
    ? secureFlag === "true"
    : port === IMPLICIT_TLS_PORT;

  return { host, port, secure, user, pass };
}

export function buildResetLink(token: string): string {
  const base = readEnv("APP_URL").replace(/\/+$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Pull the bare address out of a `Display Name <addr@host>` header value. */
export function envelopeAddress(value: string): string {
  // Checked before parsing: a crafted value such as
  // "a@b.test\r\nRCPT TO:<evil@attacker.test>" would otherwise be "cleaned up"
  // into a different, attacker-chosen address instead of being rejected.
  if (/[\r\n]/.test(value)) {
    throw new Error("refusing to use an address containing a line break");
  }
  const angled = value.match(/<([^<>]*)>/);
  const address = (angled ? angled[1] : value).trim();
  if (!address) {
    throw new Error("refusing to use an empty address");
  }
  return address;
}

function assertHeaderSafe(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(
      `refusing to build a header from a ${field} containing a line break`,
    );
  }
}

function encodeBody(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/(.{76})/g, "$1\r\n");
}

export function buildResetMessage(
  from: string,
  to: string,
  link: string,
): string {
  const text = [
    "We received a request to reset your Lost & Found password.",
    "",
    `Open this link to choose a new password: ${link}`,
    "",
    `The link expires in ${
      Math.round(RESET_TTL_SECONDS / 60)
    } minutes and can be used once.`,
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const domain = envelopeAddress(from).split("@")[1] ??
    "lost-and-found.invalid";

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${SUBJECT}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodeBody(text),
  ].join("\r\n");
}

/**
 * Deliver a reset link. Returns false for every failure so the caller can keep
 * one indistinguishable response for registered and unregistered addresses.
 */
export async function sendPasswordReset(
  to: string,
  token: string,
): Promise<boolean> {
  const config = smtpConfig();
  if (!config) return false;

  const from = readEnv("MAIL_FROM");
  try {
    assertHeaderSafe(from, "sender");
    assertHeaderSafe(to, "recipient");
    const message = buildResetMessage(from, to, buildResetLink(token));
    await sendMail(config, { from: envelopeAddress(from), to }, message);
    return true;
  } catch (err) {
    // Message text only. It never contains the password: the SMTP client
    // reports the server's reply, not the command it sent.
    console.error(
      "[Email] reset delivery failed",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
