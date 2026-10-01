// Minimal SMTP client for transactional mail, on raw Deno sockets.
//
// Deliberately not a general-purpose library: it speaks exactly the submission
// conversation needed to hand one message to a relay, and it refuses to put
// credentials on the wire unless the session is encrypted.
//
// Transport rules enforced here:
//   - port 465 style implicit TLS (config.secure) starts encrypted
//   - otherwise STARTTLS is required; if the server does not advertise it we
//     throw rather than send AUTH in the clear
//   - no command or response is ever logged, because the AUTH exchange
//     carries base64 credentials

export interface SmtpConfig {
  host: string;
  port: number;
  /** Start the connection already encrypted (implicit TLS, usually 465). */
  secure: boolean;
  user: string;
  pass: string;
}

/** The subset of Deno.Conn this client uses. Lets tests supply a fake socket. */
export interface SmtpConnection {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  close(): void;
}

export type SmtpConnector = (config: SmtpConfig) => Promise<SmtpConnection>;

const CRLF = "\r\n";
/** Whole-conversation guard. Generous enough for a slow relay on a cold start. */
const IO_TIMEOUT_MS = 15_000;
const EHLO_NAME = "localhost";

export const connectSmtp: SmtpConnector = (config) =>
  config.secure
    ? Deno.connectTls({ hostname: config.host, port: config.port })
    : Deno.connect({ hostname: config.host, port: config.port });

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** RFC 5321 transparency: a leading "." on a body line is escaped as "..". */
function dotStuff(message: string): string {
  const normalized = message.replace(/\r?\n/g, CRLF).replace(/\r\n$/, "");
  return normalized
    .split(CRLF)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join(CRLF);
}

interface SmtpResponse {
  code: number;
  /** Every line of the reply, with the leading status code removed. */
  lines: string[];
}

class SmtpSession {
  #conn: SmtpConnection;
  #reader: ReadableStreamDefaultReader<Uint8Array>;
  #writer: WritableStreamDefaultWriter<Uint8Array>;
  #decoder = new TextDecoder();
  #buffer = "";
  /** Needed to re-establish the TLS servername after a STARTTLS. */
  #hostname: string;

  constructor(conn: SmtpConnection, hostname: string) {
    this.#conn = conn;
    this.#hostname = hostname;
    this.#reader = conn.readable.getReader();
    this.#writer = conn.writable.getWriter();
  }

  close(): void {
    try {
      this.#conn.close();
    } catch {
      // already closed by the peer or by a timeout
    }
  }

  /** Swap the plaintext socket for its TLS successor after a STARTTLS. */
  async upgrade(): Promise<void> {
    // `hostname` is mandatory, not cosmetic: without it Deno derives the TLS
    // servername from the socket's peer IP, so certificate verification fails
    // with "certificate not valid for name <ip>". Verified against Brevo.
    this.#conn = await Deno.startTls(this.#conn as unknown as Deno.TcpConn, {
      hostname: this.#hostname,
    });
    this.#reader = this.#conn.readable.getReader();
    this.#writer = this.#conn.writable.getWriter();
    this.#buffer = "";
  }

  async #withTimeout<T>(label: string, work: Promise<T>): Promise<T> {
    // Keep a rejection from the losing branch from surfacing as an unhandled
    // rejection once the timeout has already settled the race.
    work.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        this.close();
        reject(new Error(`smtp ${label} timed out`));
      }, IO_TIMEOUT_MS);
    });
    try {
      return await Promise.race([work, expiry]);
    } finally {
      clearTimeout(timer);
    }
  }

  async #readLine(): Promise<string> {
    for (;;) {
      const newline = this.#buffer.indexOf("\n");
      if (newline !== -1) {
        const line = this.#buffer.slice(0, newline).replace(/\r$/, "");
        this.#buffer = this.#buffer.slice(newline + 1);
        return line;
      }
      const { value, done } = await this.#withTimeout(
        "read",
        this.#reader.read(),
      );
      if (done) throw new Error("smtp connection closed unexpectedly");
      this.#buffer += this.#decoder.decode(value, { stream: true });
    }
  }

  /** Read one full reply, following `250-` continuation lines. */
  async #readResponse(): Promise<SmtpResponse> {
    return await this.#withTimeout(
      "read",
      (async () => {
        const lines: string[] = [];
        for (;;) {
          const line = await this.#readLine();
          const match = line.match(/^(\d{3})([ -]?)(.*)$/);
          if (!match) continue; // tolerate junk between replies
          lines.push(match[3]);
          if (match[2] !== "-") {
            return { code: Number(match[1]), lines };
          }
        }
      })(),
    );
  }

  async #write(text: string): Promise<void> {
    await this.#withTimeout(
      "write",
      this.#writer.write(new TextEncoder().encode(text)),
    );
  }

  async command(line: string, expected: number[]): Promise<SmtpResponse> {
    await this.#write(`${line}${CRLF}`);
    const response = await this.#readResponse();
    if (!expected.includes(response.code)) {
      // Report the server's words, never the command: it may be AUTH.
      throw new Error(
        `smtp rejected ${line.split(" ")[0]}: ${response.code} ${
          response.lines.join(" ")
        }`.trim(),
      );
    }
    return response;
  }

  /** The greeting the server sends on connect, before any command. */
  async banner(): Promise<SmtpResponse> {
    return await this.#readResponse();
  }

  /** EHLO, returning the extension list the server advertised. */
  async ehlo(): Promise<{ caps: Set<string>; auth: Set<string> }> {
    const response = await this.command(`EHLO ${EHLO_NAME}`, [250]);
    const caps = new Set<string>();
    const auth = new Set<string>();
    for (const line of response.lines) {
      const [token, ...params] = line.trim().split(/\s+/);
      if (!token) continue;
      caps.add(token.toUpperCase());
      if (token.toUpperCase() === "AUTH") {
        for (const param of params) auth.add(param.toUpperCase());
      }
    }
    return { caps, auth };
  }

  async data(message: string): Promise<void> {
    await this.command("DATA", [354]);
    await this.#write(`${dotStuff(message)}${CRLF}.${CRLF}`);
    await this.#readResponse().then((response) => {
      if (response.code !== 250) {
        throw new Error(`smtp rejected message body: ${response.code}`);
      }
    });
  }

  async quit(): Promise<void> {
    try {
      await this.command("QUIT", [221]);
    } catch {
      // The message is already accepted; a rude disconnect is not our problem.
    }
  }
}

async function authenticate(
  session: SmtpSession,
  mechanisms: Set<string>,
  config: SmtpConfig,
): Promise<void> {
  if (mechanisms.has("PLAIN")) {
    // PLAIN with an initial response: one round trip, no challenge echo.
    await session.command(
      `AUTH PLAIN ${base64(`\0${config.user}\0${config.pass}`)}`,
      [235],
    );
    return;
  }
  if (mechanisms.has("LOGIN")) {
    await session.command("AUTH LOGIN", [334]);
    await session.command(base64(config.user), [334]);
    await session.command(base64(config.pass), [235]);
    return;
  }
  throw new Error("smtp server advertises no supported AUTH mechanism");
}

/**
 * Deliver one message. Resolves only when the server has accepted the body.
 * Throws on any protocol, TLS, credential or timeout failure.
 */
export async function sendMail(
  config: SmtpConfig,
  envelope: { from: string; to: string },
  message: string,
  connector: SmtpConnector = connectSmtp,
): Promise<void> {
  const conn = await connector(config);
  const session = new SmtpSession(conn, config.host);
  try {
    const banner = await session.banner();
    if (banner.code !== 220) {
      throw new Error(`smtp greeting rejected: ${banner.code}`);
    }

    let { caps, auth } = await session.ehlo();

    if (!config.secure) {
      if (!caps.has("STARTTLS")) {
        throw new Error(
          "smtp server does not offer STARTTLS; refusing to send in the clear",
        );
      }
      await session.command("STARTTLS", [220]);
      await session.upgrade();
      // Capabilities advertised before STARTTLS cannot be trusted; ask again.
      ({ auth } = await session.ehlo());
    }

    if (config.user) {
      await authenticate(session, auth, config);
    }

    await session.command(`MAIL FROM:<${envelope.from}>`, [250]);
    await session.command(`RCPT TO:<${envelope.to}>`, [250, 251]);
    await session.data(message);
    await session.quit();
  } finally {
    session.close();
  }
}
