import { describe, it } from "@std/testing/bdd";
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { sendMail, type SmtpConnection } from "../_shared/smtp.ts";
import { createFakeSmtp, fakeConfig } from "./helpers/fakeSmtp.ts";

const ENVELOPE = { from: "no-reply@example.test", to: "someone@example.test" };

async function withSmtp<T>(
  options: Parameters<typeof createFakeSmtp>[0],
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

/** A socket that closes immediately, standing in for a dropped connection. */
function deadConnection(): SmtpConnection {
  return {
    readable: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    }),
    writable: new WritableStream<Uint8Array>(),
    close() {},
  };
}

describe("sendMail transport", () => {
  it("upgrades with STARTTLS before sending credentials", async () => {
    await withSmtp({}, async (smtp) => {
      await sendMail(fakeConfig(), ENVELOPE, "Subject: t\r\n\r\nbody");
      assertEquals(smtp.commandNames, [
        "EHLO",
        "STARTTLS",
        "EHLO",
        "AUTH",
        "MAIL",
        "RCPT",
        "DATA",
        "QUIT",
      ]);
    });
  });

  it("skips STARTTLS on an implicitly encrypted port", async () => {
    await withSmtp({}, async (smtp) => {
      await sendMail(
        fakeConfig({ secure: true, port: 465 }),
        ENVELOPE,
        "Subject: t\r\n\r\nbody",
      );
      assert(
        !smtp.commandNames.includes("STARTTLS"),
        "implicit TLS must not send STARTTLS",
      );
      assertEquals(smtp.upgraded, false);
      assert(
        smtp.commandNames.includes("AUTH"),
        "credentials may travel over implicit TLS",
      );
    });
  });

  it("passes the hostname to startTls so certificate verification can succeed", async () => {
    // Regression: Deno.startTls(conn) with no options derives the TLS
    // servername from the socket's peer IP, so verification fails with
    // "certificate not valid for name <ip>". Found against a live relay.
    await withSmtp({}, async (smtp) => {
      await sendMail(fakeConfig(), ENVELOPE, "Subject: t\r\n\r\nbody");
      assertEquals(smtp.upgraded, true);
      assertEquals(
        (smtp.startTlsOptions as { hostname?: string } | undefined)?.hostname,
        "smtp.example.test",
        "startTls must receive the SMTP host, not the resolved IP",
      );
    });
  });

  it("refuses to authenticate over a link the relay will not upgrade", async () => {
    await withSmtp({ advertiseStartTls: false }, async (smtp) => {
      await assertRejects(
        () => sendMail(fakeConfig(), ENVELOPE, "Subject: t\r\n\r\nbody"),
        Error,
        "STARTTLS",
      );
      assert(
        !smtp.commandNames.includes("AUTH"),
        "no credentials in the clear",
      );
      assert(!smtp.commandNames.includes("MAIL"), "no envelope without TLS");
    });
  });

  it("rejects a greeting that is not 220", async () => {
    await withSmtp({ greetingCode: 554 }, async () => {
      await assertRejects(
        () => sendMail(fakeConfig(), ENVELOPE, "Subject: t\r\n\r\nbody"),
        Error,
        "greeting rejected",
      );
    });
  });

  it("fails when the relay advertises no mechanism we support", async () => {
    await withSmtp({ authMechanisms: ["CRAM-MD5"] }, async (smtp) => {
      await assertRejects(
        () => sendMail(fakeConfig(), ENVELOPE, "Subject: t\r\n\r\nbody"),
        Error,
        "no supported AUTH mechanism",
      );
      assert(
        !smtp.commandNames.includes("MAIL"),
        "no envelope without authentication",
      );
    });
  });

  it("propagates a failure to connect", async () => {
    await assertRejects(
      () =>
        sendMail(
          fakeConfig(),
          ENVELOPE,
          "Subject: t\r\n\r\nbody",
          () => Promise.reject(new Error("ECONNREFUSED")),
        ),
      Error,
      "ECONNREFUSED",
    );
  });

  it("fails when the peer hangs up mid-conversation", async () => {
    await assertRejects(
      () =>
        sendMail(
          fakeConfig(),
          ENVELOPE,
          "Subject: t\r\n\r\nbody",
          () => Promise.resolve(deadConnection()),
        ),
      Error,
      "closed unexpectedly",
    );
  });

  it("closes the socket even when the send fails", async () => {
    await withSmtp({ rejectData: true }, async (smtp) => {
      await assertRejects(() =>
        sendMail(fakeConfig(), ENVELOPE, "Subject: t\r\n\r\nbody")
      );
      assertEquals(smtp.closed, true, "a failed send must not leak the socket");
    });
  });

  it("stops at the first rejected envelope command", async () => {
    await withSmtp({ rejectMailFrom: true }, async (smtp) => {
      await assertRejects(() =>
        sendMail(fakeConfig(), ENVELOPE, "Subject: t\r\n\r\nbody")
      );
      assert(
        !smtp.commandNames.includes("RCPT"),
        "no recipient after a rejected sender",
      );
    });
  });
});

describe("sendMail message framing", () => {
  it("dot-stuffs a body line that starts with a period", async () => {
    const message = "Subject: t\r\n\r\n.dot line\r\nnormal";
    await withSmtp({}, async (smtp) => {
      await sendMail(fakeConfig(), ENVELOPE, message);
      assertStringIncludes(smtp.rawData, "..dot line");
      assertStringIncludes(smtp.data, "\n.dot line");
      assert(
        !smtp.rawData.includes("\n..normal"),
        "only a leading period is escaped",
      );
    });
  });

  it("normalises bare newlines and does not duplicate the terminator", async () => {
    await withSmtp({}, async (smtp) => {
      await sendMail(fakeConfig(), ENVELOPE, "Subject: t\n\none\ntwo\n");
      assertStringIncludes(smtp.wireData, "Subject: t\r\n\r\n");
      assertStringIncludes(smtp.wireData, "one\r\ntwo\r\n");
      assertEquals(smtp.data, "Subject: t\n\none\ntwo");
    });
  });

  it("ends the body with exactly one terminator before the lone period", async () => {
    await withSmtp({}, async (smtp) => {
      // A trailing CRLF in the input must not become a blank body line.
      await sendMail(fakeConfig(), ENVELOPE, "Subject: t\r\n\r\nend\r\n");
      assert(
        smtp.wireData.endsWith("end\r\n.\r\n"),
        `unexpected tail: ${JSON.stringify(smtp.wireData.slice(-12))}`,
      );
      assertEquals(smtp.data, "Subject: t\n\nend");
    });
  });

  it("terminates the body with a lone period on its own line", async () => {
    await withSmtp({}, async (smtp) => {
      await sendMail(fakeConfig(), ENVELOPE, "Subject: t\r\n\r\nend");
      assert(
        smtp.commandNames.includes("QUIT"),
        "the relay accepted the body, so we quit",
      );
    });
  });
});

describe("envelope address handling", () => {
  it("rejects an address containing a line break", async () => {
    const { envelopeAddress } = await import("../_shared/email.ts");
    // The client itself does not sanitise, so a crafted value that survived
    // parsing here would split the RCPT command and redirect the message.
    for (
      const hostile of [
        "a@b.test\r\nRCPT TO:<victim@evil.test>",
        "a@b.test\nDATA",
        "Name <a@b.test>\r\nBcc: <evil@attacker.test>",
      ]
    ) {
      assertThrows(() => envelopeAddress(hostile), Error, "line break");
    }
  });

  it("unwraps a display name", async () => {
    const { envelopeAddress } = await import("../_shared/email.ts");
    assertEquals(
      envelopeAddress("Lost & Found <no-reply@example.test>"),
      "no-reply@example.test",
    );
    assertEquals(envelopeAddress("bare@example.test"), "bare@example.test");
    assertThrows(() => envelopeAddress("   "), Error, "empty address");
  });
});
