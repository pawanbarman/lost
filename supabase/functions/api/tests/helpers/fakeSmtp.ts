// A stateful, in-process SMTP server used to drive the real client in
// _shared/smtp.ts without touching a network.
//
// It answers a genuine submission conversation (banner, EHLO, STARTTLS, AUTH,
// MAIL, RCPT, DATA, QUIT) and records everything the client sent, so tests
// assert on the real dialogue rather than on a mocked abstraction.

import type { SmtpConfig, SmtpConnection } from "../../_shared/smtp.ts";

export interface FakeSmtpOptions {
  /** Advertise the STARTTLS extension. Default true. */
  advertiseStartTls?: boolean;
  /** Mechanisms to advertise on the AUTH extension. Default both. */
  authMechanisms?: string[];
  /** Greeting status code. Default 220. */
  greetingCode?: number;
  /** Answer AUTH with 535. Default false. */
  rejectAuth?: boolean;
  /** Answer RCPT TO with 550. Default false. */
  rejectRecipient?: boolean;
  /** Answer the end of DATA with 554. Default false. */
  rejectData?: boolean;
  /** Answer MAIL FROM with 503. Default false. */
  rejectMailFrom?: boolean;
}

export interface FakeSmtpServer {
  /** Every command line the client sent, including base64 AUTH blobs. */
  readonly commands: string[];
  /** Command lines reduced to their first token, safe to print. */
  readonly commandNames: string[];
  /** Raw DATA payload with dot-stuffing undone. */
  readonly data: string;
  /** DATA payload exactly as it arrived on the wire, dot-stuffing intact. */
  readonly rawData: string;
  /** DATA payload with original line terminators, to assert CRLF framing. */
  readonly wireData: string;
  /** Parsed headers of the DATA payload. */
  readonly headers: Record<string, string>;
  /** Decoded message body. */
  readonly body: string;
  /** True once the client upgraded a socket with startTls. */
  readonly upgraded: boolean;
  /** The options the client passed to Deno.startTls, if it did. */
  readonly startTlsOptions: unknown;
  /** True once the client called close() on a socket. */
  readonly closed: boolean;
  install(): void;
  restore(): void;
}

const CRLF = "\r\n";

export function createFakeSmtp(options: FakeSmtpOptions = {}): FakeSmtpServer {
  const advertiseStartTls = options.advertiseStartTls ?? true;
  const mechanisms = options.authMechanisms ?? ["PLAIN", "LOGIN"];
  const greetingCode = options.greetingCode ?? 220;

  const commands: string[] = [];
  let data = "";
  let rawData = "";
  let wire = "";
  let upgraded = false;
  let startTlsOptions: unknown;
  let closed = false;

  // Per-connection conversation state.
  let inData = false;
  let dataLines: string[] = [];
  /** 0 = idle, 1 = username requested, 2 = password requested. */
  let authStage: 0 | 1 | 2 = 0;
  let active: ReadableStreamDefaultController<Uint8Array> | null = null;
  let socketClosed = false;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function push(text: string): void {
    if (socketClosed || !active) return;
    active.enqueue(encoder.encode(text));
  }

  function ehloReply(): string {
    const lines = ["250-smtp.example.test Hello"];
    if (advertiseStartTls) lines.push("250-STARTTLS");
    if (mechanisms.length > 0) lines.push(`250-AUTH ${mechanisms.join(" ")}`);
    lines.push("250 SIZE 10485760");
    return lines.join(CRLF) + CRLF;
  }

  function handle(line: string): void {
    if (inData) {
      if (line === ".") {
        inData = false;
        rawData = dataLines.join("\n");
        data = dataLines.map((l) => (l.startsWith("..") ? l.slice(1) : l)).join(
          "\n",
        );
        dataLines = [];
        push(
          options.rejectData
            ? "554 5.3.0 Message rejected" + CRLF
            : "250 2.0.0 Ok: queued" + CRLF,
        );
      } else {
        dataLines.push(line);
      }
      return;
    }

    // AUTH LOGIN continuation lines arrive as bare base64 blobs with no verb.
    if (authStage === 1) {
      authStage = 2;
      push("334 UGFzc3dvcmQ6" + CRLF);
      return;
    }
    if (authStage === 2) {
      authStage = 0;
      push("235 2.7.0 Accepted" + CRLF);
      return;
    }

    const [verb, ...rest] = line.toUpperCase().split(/\s+/);

    switch (verb) {
      case "EHLO":
        push(ehloReply());
        return;
      case "HELO":
        push("250 smtp.example.test" + CRLF);
        return;
      case "STARTTLS":
        push("220 2.0.0 Ready to start TLS" + CRLF);
        return;
      case "AUTH": {
        if (options.rejectAuth) {
          push("535 5.7.8 Authentication credentials invalid" + CRLF);
          return;
        }
        const mech = rest[0] ?? "";
        if (mech === "LOGIN") {
          if (rest.length > 1) {
            // username supplied inline; still need the password
            authStage = 2;
            push("334 UGFzc3dvcmQ6" + CRLF);
          } else {
            authStage = 1;
            push("334 VXNlcm5hbWU6" + CRLF);
          }
          return;
        }
        if (mech === "PLAIN") {
          push("235 2.7.0 Accepted" + CRLF);
          return;
        }
        push("504 5.5.4 Unrecognized authentication type" + CRLF);
        return;
      }
      case "MAIL":
        push(
          (options.rejectMailFrom
            ? "503 5.5.1 Bad sequence of commands"
            : "250 2.1.0 Ok") + CRLF,
        );
        return;
      case "RCPT":
        push(
          (options.rejectRecipient
            ? "550 5.1.1 No such user"
            : "250 2.1.5 Ok") + CRLF,
        );
        return;
      case "DATA":
        inData = true;
        push("354 End data with <CR><LF>.<CR><LF>" + CRLF);
        return;
      case "QUIT":
        push("221 2.0.0 Bye" + CRLF);
        return;
      case "RSET":
        push("250 2.0.0 Ok" + CRLF);
        return;
      default:
        push("500 5.5.2 Unrecognized command" + CRLF);
    }
  }

  function createConnection(sendBanner: boolean): SmtpConnection {
    socketClosed = false;
    inData = false;
    dataLines = [];
    authStage = 0;
    wire = "";
    let buffer = "";

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        active = controller;
        if (!sendBanner) return;
        controller.enqueue(encoder.encode(
          greetingCode === 220
            ? "220 smtp.example.test ESMTP ready" + CRLF
            : `${greetingCode} Service unavailable` + CRLF,
        ));
      },
    });

    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        buffer += decoder.decode(chunk, { stream: true });
        for (;;) {
          const newline = buffer.indexOf("\n");
          if (newline === -1) return;
          const wireLine = buffer.slice(0, newline + 1);
          const line = wireLine.replace(/\r?\n$/, "");
          buffer = buffer.slice(newline + 1);
          if (inData) wire += wireLine;
          else commands.push(line);
          handle(line);
        }
      },
    });

    return {
      readable,
      writable,
      close() {
        socketClosed = true;
        closed = true;
      },
    };
  }

  const realConnect = Deno.connect;
  const realConnectTls = Deno.connectTls;
  const realStartTls = Deno.startTls;

  return {
    get commands() {
      return commands;
    },
    get commandNames() {
      return commands.map((line) => line.split(" ")[0]);
    },
    get data() {
      return data;
    },
    get rawData() {
      return rawData;
    },
    get wireData() {
      return wire;
    },
    get headers() {
      const headers: Record<string, string> = {};
      for (const line of data.split("\n")) {
        if (line === "") break;
        const colon = line.indexOf(":");
        if (colon === -1) continue;
        headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(
          colon + 1,
        ).trim();
      }
      return headers;
    },
    get body() {
      const blank = data.indexOf("\n\n");
      if (blank === -1) return "";
      try {
        return atob(data.slice(blank + 2).replace(/\s+/g, ""));
      } catch {
        return "";
      }
    },
    get upgraded() {
      return upgraded;
    },
    get startTlsOptions() {
      return startTlsOptions;
    },
    get closed() {
      return closed;
    },
    install() {
      // The fakes return a minimal connection, not a real Deno socket, so the
      // global signatures have to be re-asserted rather than satisfied.
      Deno.connect = (() =>
        Promise.resolve(
          createConnection(true),
        )) as unknown as typeof Deno.connect;
      Deno.connectTls = (() =>
        Promise.resolve(
          createConnection(true),
        )) as unknown as typeof Deno.connectTls;
      Deno.startTls = ((_conn: Deno.Conn, options?: unknown) => {
        upgraded = true;
        startTlsOptions = options;
        // The upgraded socket continues an existing session: no new banner.
        return Promise.resolve(createConnection(false));
      }) as unknown as typeof Deno.startTls;
    },
    restore() {
      Deno.connect = realConnect;
      Deno.connectTls = realConnectTls;
      Deno.startTls = realStartTls;
    },
  };
}

/** Config matching the fake server's advertised behaviour. */
export function fakeConfig(overrides: Partial<SmtpConfig> = {}): SmtpConfig {
  return {
    host: "smtp.example.test",
    port: 587,
    secure: false,
    user: "mailer",
    pass: "s3cret",
    ...overrides,
  };
}
