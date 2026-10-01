import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { stub } from "@std/testing/mock";
import { Application } from "oak";
import { errorHandler } from "../_shared/error.ts";
import { createFakeSmtp, type FakeSmtpOptions } from "./helpers/fakeSmtp.ts";

// _shared/env.ts snapshots Deno.env when it is first evaluated, and static imports are
// hoisted above any statement in this file. So the values the Supabase admin client and
// the JWT signer need must be set first, and every module that reaches env.ts has to be
// pulled in dynamically afterwards.
const SUPABASE_URL = "https://stub.supabase.test";
Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("JWT_SECRET", "test-jwt-secret-value-long-enough-for-hs256");

const { isEmailConfigured, buildResetLink, sendPasswordReset } = await import(
  "../_shared/email.ts"
);
const { default: authRouter } = await import("../routers/auth.ts");

const KNOWN_EMAIL = "known@example.test";
const UNKNOWN_EMAIL = "nobody@example.test";
const USER_ID = "11111111-2222-3333-4444-555555555555";
const SMTP_PASSWORD = "sup3r-s3cret-passphrase";

const EMAIL_ENV: Record<string, string> = {
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "587",
  SMTP_USER: "mailer",
  SMTP_PASS: SMTP_PASSWORD,
  MAIL_FROM: "Lost & Found <no-reply@example.test>",
  APP_URL: "https://lost.example",
};

/** Stub only the email-related env vars; everything else falls through to the real env. */
function withEmailEnv(vars: Record<string, string>) {
  const realGet = Deno.env.get.bind(Deno.env);
  return stub(Deno.env, "get", (name: string) => {
    if (name in vars) return vars[name];
    return realGet(name);
  });
}

/** Install an in-process SMTP relay for the duration of `work`. */
async function withSmtp<T>(
  options: FakeSmtpOptions,
  work: (smtp: ReturnType<typeof createFakeSmtp>) => Promise<T>,
): Promise<T> {
  const smtp = createFakeSmtp(options);
  smtp.install();
  try {
    return await work(smtp);
  } finally {
    smtp.restore();
  }
}

type FetchCall = { url: string; init: RequestInit };

/**
 * Answer the PostgREST User lookup from `users`. Mail no longer travels over HTTP,
 * so any other outbound call is a regression and is recorded for assertions.
 */
function withNetwork(
  calls: FetchCall[],
  users: Record<string, { id: string; email: string }>,
) {
  return stub(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });

      if (url.startsWith(`${SUPABASE_URL}/rest/v1/`)) {
        const match = url.match(/[?&]email=eq\.([^&]+)/);
        const email = match ? decodeURIComponent(match[1]) : "";
        const row = users[email];
        return Promise.resolve(
          new Response(JSON.stringify(row ? [row] : []), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(new Response("{}", { status: 200 }));
    },
  );
}

function postForgotPassword(email: string): Promise<Response> {
  const app = new Application();
  app.use(errorHandler());
  app.use(authRouter.routes());
  app.use(authRouter.allowedMethods());

  return app
    .handle(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    )
    .then((res) => res ?? new Response(null, { status: 500 }));
}

describe("email configuration", () => {
  it("is unconfigured when every email variable is missing", () => {
    using _env = withEmailEnv({});
    assertEquals(isEmailConfigured(), false);
  });

  it("is unconfigured when any single email variable is missing", () => {
    for (const missing of ["SMTP_HOST", "MAIL_FROM", "APP_URL"]) {
      const vars = { ...EMAIL_ENV };
      delete vars[missing as keyof typeof vars];
      using _env = withEmailEnv(vars);
      assertEquals(
        isEmailConfigured(),
        false,
        `missing ${missing} must fail closed`,
      );
    }
  });

  it("is unconfigured when the password is set but the username is not", () => {
    using _env = withEmailEnv({ ...EMAIL_ENV, SMTP_USER: "" });
    assertEquals(isEmailConfigured(), false);
  });

  it("is unconfigured when the username is set but the password is not", () => {
    using _env = withEmailEnv({ ...EMAIL_ENV, SMTP_PASS: "" });
    assertEquals(isEmailConfigured(), false);
  });

  it("is configured without credentials, for an open trusted relay", () => {
    using _env = withEmailEnv({
      SMTP_HOST: "localhost",
      MAIL_FROM: "no-reply@example.test",
      APP_URL: "https://lost.example",
    });
    assertEquals(isEmailConfigured(), true);
  });

  it("is configured only when all three are present", () => {
    using _env = withEmailEnv(EMAIL_ENV);
    assertEquals(isEmailConfigured(), true);
  });
});

describe("buildResetLink", () => {
  it("points at the client reset route", () => {
    using _env = withEmailEnv(EMAIL_ENV);
    assertEquals(
      buildResetLink("abc.def.ghi"),
      "https://lost.example/reset-password?token=abc.def.ghi",
    );
  });

  it("strips a trailing slash from APP_URL so the path does not double up", () => {
    using _env = withEmailEnv({
      ...EMAIL_ENV,
      APP_URL: "https://lost.example/",
    });
    assertStringIncludes(
      buildResetLink("t"),
      "https://lost.example/reset-password",
    );
  });

  it("url-encodes the token", () => {
    using _env = withEmailEnv(EMAIL_ENV);
    assertStringIncludes(buildResetLink("a+b/c=d"), "token=a%2Bb%2Fc%3Dd");
  });
});

describe("sendPasswordReset", () => {
  it("does not open a connection when email is unconfigured", async () => {
    const calls: FetchCall[] = [];
    using _env = withEmailEnv({});
    using _net = withNetwork(calls, {});
    await withSmtp({}, async (smtp) => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), false);
      assertEquals(
        smtp.commands.length,
        0,
        "no SMTP traffic when unconfigured",
      );
    });
  });

  it("delivers the reset link over SMTP without any HTTP call", async () => {
    const calls: FetchCall[] = [];
    using _env = withEmailEnv(EMAIL_ENV);
    using _net = withNetwork(calls, {});

    await withSmtp({}, async (smtp) => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok-123"), true);
      assertEquals(
        smtp.upgraded,
        true,
        "the session must be upgraded before AUTH",
      );
      assertEquals(calls.length, 0, "mail must not travel over HTTP any more");

      const names = smtp.commandNames;
      for (
        const verb of [
          "EHLO",
          "STARTTLS",
          "AUTH",
          "MAIL",
          "RCPT",
          "DATA",
          "QUIT",
        ]
      ) {
        assert(
          names.includes(verb),
          `expected a ${verb} command, got ${names.join(", ")}`,
        );
      }
      assertStringIncludes(
        smtp.commands.find((c) => c.startsWith("MAIL"))!,
        "<no-reply@example.test>",
      );
      assertStringIncludes(
        smtp.commands.find((c) => c.startsWith("RCPT"))!,
        `<${KNOWN_EMAIL}>`,
      );
      assertEquals(smtp.headers.subject, "Reset your Lost & Found password");
      assertStringIncludes(
        smtp.body,
        "https://lost.example/reset-password?token=tok-123",
      );
    });
  });

  it("uses AUTH PLAIN when the relay advertises it", async () => {
    using _env = withEmailEnv(EMAIL_ENV);
    await withSmtp({ authMechanisms: ["PLAIN"] }, async (smtp) => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), true);
      const auth = smtp.commands.find((c) => c.startsWith("AUTH"));
      assertStringIncludes(auth!, "AUTH PLAIN ");
    });
  });

  it("falls back to the AUTH LOGIN challenge when PLAIN is unavailable", async () => {
    using _env = withEmailEnv(EMAIL_ENV);
    await withSmtp({ authMechanisms: ["LOGIN"] }, async (smtp) => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), true);
      assertStringIncludes(
        smtp.commands[smtp.commands.indexOf("AUTH LOGIN")],
        "AUTH LOGIN",
      );
    });
  });

  it("sends without AUTH when no credentials are configured", async () => {
    using _env = withEmailEnv({
      SMTP_HOST: "localhost",
      SMTP_PORT: "2525",
      MAIL_FROM: "no-reply@example.test",
      APP_URL: "https://lost.example",
    });
    await withSmtp({}, async (smtp) => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), true);
      assert(
        !smtp.commandNames.includes("AUTH"),
        "an open relay needs no AUTH",
      );
    });
  });

  it("refuses to deliver over an unencrypted link the relay will not upgrade", async () => {
    using _env = withEmailEnv(EMAIL_ENV);
    await withSmtp({ advertiseStartTls: false }, async (smtp) => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), false);
      assert(
        !smtp.commandNames.includes("AUTH"),
        "credentials must not be sent in the clear",
      );
      assert(
        !smtp.commandNames.includes("MAIL"),
        "nothing may be relayed without TLS",
      );
    });
  });

  it("reports failure when the relay rejects the recipient", async () => {
    using _env = withEmailEnv(EMAIL_ENV);
    await withSmtp({ rejectRecipient: true }, async (smtp) => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), false);
      assert(
        !smtp.commandNames.includes("DATA"),
        "a rejected recipient must stop the send",
      );
    });
  });

  it("reports failure when the relay rejects the message body", async () => {
    using _env = withEmailEnv(EMAIL_ENV);
    await withSmtp({ rejectData: true }, async () => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), false);
    });
  });

  it("reports failure when credentials are rejected", async () => {
    using _env = withEmailEnv(EMAIL_ENV);
    await withSmtp({ rejectAuth: true }, async (smtp) => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), false);
      assert(
        !smtp.commandNames.includes("MAIL"),
        "no envelope may be opened after a failed AUTH",
      );
    });
  });

  it("never throws when the connection fails", async () => {
    using _env = withEmailEnv(EMAIL_ENV);
    const smtp = createFakeSmtp();
    smtp.install();
    Deno.connect = (() =>
      Promise.reject(
        new Error("ECONNREFUSED"),
      )) as unknown as typeof Deno.connect;
    try {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), false);
    } finally {
      smtp.restore();
    }
  });

  it("does not leak the smtp password through the logged error", async () => {
    using _env = withEmailEnv(EMAIL_ENV);
    const logged: string[] = [];
    using _log = stub(console, "error", (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    await withSmtp({ rejectAuth: true }, async () => {
      assertEquals(await sendPasswordReset(KNOWN_EMAIL, "tok"), false);
    });
    assert(logged.length > 0, "a failed send must be logged");
    assert(
      !logged.some((line) => line.includes(SMTP_PASSWORD)),
      "the SMTP password must never reach the logs",
    );
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("returns 503 and no token when email transport is unconfigured", async () => {
    const calls: FetchCall[] = [];
    using _env = withEmailEnv({});
    using _net = withNetwork(calls, {
      [KNOWN_EMAIL]: { id: USER_ID, email: KNOWN_EMAIL },
    });

    const res = await withSmtp(
      {},
      async () => await postForgotPassword(KNOWN_EMAIL),
    );
    assertEquals(res.status, 503);

    const body = await res.text();
    assert(
      !body.includes("resetToken"),
      "response must not contain a resetToken field",
    );
    assertEquals(
      calls.length,
      0,
      "no token may be generated or delivered when unconfigured",
    );
  });

  it("emails a link and never returns a token for a registered address", async () => {
    const calls: FetchCall[] = [];
    using _env = withEmailEnv(EMAIL_ENV);
    using _net = withNetwork(calls, {
      [KNOWN_EMAIL]: { id: USER_ID, email: KNOWN_EMAIL },
    });

    let res: Response;
    await withSmtp({}, async (smtp) => {
      res = await postForgotPassword(KNOWN_EMAIL);
      assertStringIncludes(smtp.body, "/reset-password?token=");
    });

    assertEquals(res!.status, 200);
    const body = await res!.text();
    assert(
      !body.includes("resetToken"),
      "response must not contain a resetToken field",
    );
    const jwtPattern = /[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\./;
    assert(!jwtPattern.test(body), "response must not contain a JWT");
  });

  it("returns a byte-identical body for an unknown address (no account enumeration)", async () => {
    const knownCalls: FetchCall[] = [];
    const unknownCalls: FetchCall[] = [];
    const users = { [KNOWN_EMAIL]: { id: USER_ID, email: KNOWN_EMAIL } };

    using _env = withEmailEnv(EMAIL_ENV);
    let knownBody = "";
    let unknownBody = "";
    let unknownCommands: string[] = [];
    {
      using _net = withNetwork(knownCalls, users);
      await withSmtp({}, async () => {
        const res = await postForgotPassword(KNOWN_EMAIL);
        knownBody = await res.text();
      });
    }
    {
      using _net = withNetwork(unknownCalls, users);
      await withSmtp({}, async (smtp) => {
        const res = await postForgotPassword(UNKNOWN_EMAIL);
        unknownBody = await res.text();
        unknownCommands = [...smtp.commandNames];
      });
    }

    assertEquals(unknownBody, knownBody, "responses must be indistinguishable");
    assert(
      !unknownCommands.includes("RCPT"),
      "no mail may be relayed for an unregistered address",
    );
  });

  it("still returns the generic message when the email send fails", async () => {
    const calls: FetchCall[] = [];
    using _env = withEmailEnv(EMAIL_ENV);
    using _net = withNetwork(calls, {
      [KNOWN_EMAIL]: { id: USER_ID, email: KNOWN_EMAIL },
    });

    const res = await withSmtp(
      { rejectData: true },
      async () => await postForgotPassword(KNOWN_EMAIL),
    );
    assertEquals(res.status, 200);

    const body = await res.text();
    assert(
      !body.includes("resetToken"),
      "a failed send must not fall back to returning a token",
    );
  });

  it("rejects a malformed email before doing any work", async () => {
    const calls: FetchCall[] = [];
    using _env = withEmailEnv(EMAIL_ENV);
    using _net = withNetwork(calls, {});

    const res = await withSmtp(
      {},
      async () => await postForgotPassword("not-an-email"),
    );
    assertEquals(res.status, 400);
    assertEquals(calls.length, 0);
  });
});
