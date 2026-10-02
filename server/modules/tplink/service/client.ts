import { Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

import { aesDecrypt, aesEncrypt, md5Hex, randomKeyIvPart, rsaEncryptNoPadding } from "./protocolCrypto";

const tracer = trace.getTracer("tplink");

const COMMON_HEADERS = {
  Accept: "text/plain, */*; q=0.01",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
};

export interface TpLinkClientOptions {
  host: string;
  username: string;
  password: string;
}

/** Attributes that identify this client as the TP-Link router service. */
const TPLINK_SERVICE_ATTRS = {
  "peer.service": "tp-link",
  "service_name": "tp-link-router",
} as const;

async function withSpan<T>(
  name: string,
  attributes: Record<string, string>,
  fn: () => Promise<T>,
  onResult?: (result: T, span: Span) => void,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { kind: SpanKind.CLIENT, attributes: { ...TPLINK_SERVICE_ATTRS, ...attributes } },
    async (span) => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        if (onResult) {
          onResult(result, span);
        }
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

export class TpLinkClient {
  private host: string;
  private username: string;
  private password: string;

  private nn = "";
  private ee = "";
  private seq = 0;
  private hash = "";

  private aesKey = "";
  private aesIv = "";

  private token = "0";
  private sessionCookie = "";

  constructor(opts: TpLinkClientOptions) {
    this.host = opts.host;
    this.username = opts.username;
    this.password = opts.password;
  }

  private baseUrl(path: string): string {
    return `http://${this.host}${path}`;
  }

  private captureCookie(res: Response): void {
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      this.sessionCookie = setCookie.split(";")[0] ?? "";
    }
  }

  private commonHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...COMMON_HEADERS };
    if (this.sessionCookie) headers["Cookie"] = this.sessionCookie;
    return headers;
  }

  private async fetchGDPRParm(): Promise<void> {
    await withSpan("tplink.fetchGDPRParm", { "server.address": this.host }, async () => {
      const res = await fetch(this.baseUrl("/cgi/getGDPRParm"), {
        method: "POST",
        headers: {
          ...this.commonHeaders(),
          "Content-Type": "text/plain",
          Origin: `http://${this.host}`,
          Referer: `http://${this.host}/`,
          TokenID: this.token,
        },
        body: "",
        skipInstrumentation: true,
      } as any);
      this.captureCookie(res);

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`getGDPRParm failed: HTTP ${res.status}: ${text}`);
      }

      const nn = /var\s+nn\s*=\s*"([^"]*)"/.exec(text)?.[1];
      const ee = /var\s+ee\s*=\s*"([^"]*)"/.exec(text)?.[1];
      const seq = /var\s+seq\s*=\s*"([^"]*)"/.exec(text)?.[1];

      if (!nn || !ee || !seq) {
        throw new Error(`Could not parse getGDPRParm response: ${text}`);
      }

      this.nn = nn;
      this.ee = ee;
      this.seq = parseInt(seq, 10);
    });
  }

  private buildSign(payloadForRsa: string): string {
    return rsaEncryptNoPadding(payloadForRsa, this.nn, this.ee);
  }

  /** Low level POST to /cgi_gdpr?9, returns decrypted response text. */
  private async postGdpr(
    jsonBody: string,
    isLogin: boolean,
    aesKey: string,
    aesIv: string,
  ): Promise<string> {
    return withSpan(
      "tplink.postGdpr",
      {
        "server.address": this.host,
        "tplink.operation": isLogin ? "login" : "call",
        "tplink.request.body": jsonBody,
      },
      async () => {
        try {
          const data = aesEncrypt(jsonBody, aesKey, aesIv);
          const dataLen = data.length;

          const signPlain = isLogin
            ? `key=${aesKey}&iv=${aesIv}&h=${this.hash}&s=${this.seq + dataLen}`
            : `h=${this.hash}&s=${this.seq + dataLen}`;

          const sign = this.buildSign(signPlain);

          const body = `sign=${sign}\r\ndata=${data}\r\n`;
          const res = await fetch(this.baseUrl("/cgi_gdpr?9"), {
            method: "POST",
            headers: {
              ...this.commonHeaders(),
              "Content-Type": "text/plain",
              Origin: `http://${this.host}`,
              Referer: `http://${this.host}/`,
              TokenID: this.token,
            },
            body,
            skipInstrumentation: true,
          } as any);

          this.captureCookie(res);

          const text = await res.text();
          if (!res.ok) {
            throw new Error(`cgi_gdpr failed: HTTP ${res.status}: ${text}`);
          }

          return aesDecrypt(text.trim(), aesKey, aesIv);
        } catch (error: unknown) {
          console.error(
            "Error while make request to TP-Link router:",
            JSON.stringify({ jsonBody, error }),
          );
          throw new Error("Request Error", { cause: error });
        }
      },
      (result, span) => {
        span.setAttribute("tplink.response.body", result);
        span.setAttribute("tplink.response.body.size", result.length);
      },
    );
  }

  private extractToken(html: string): string | null {
    return /var\s+token\s*=\s*"([^"]*)"/.exec(html)?.[1] ?? null;
  }

  private isLoginPageResponse(html: string): boolean {
    return html.toLowerCase().includes("login") && !this.extractToken(html);
  }

  private async doLogin(aesKey: string, aesIv: string): Promise<void> {
    await withSpan("tplink.doLogin", { "server.address": this.host }, async () => {
      this.aesKey = aesKey;
      this.aesIv = aesIv;

      const indexRes = await fetch(this.baseUrl("/"), { headers: this.commonHeaders(), skipInstrumentation: true } as any);
      this.captureCookie(indexRes);
      const indexHtml = await indexRes.text();

      if (this.isLoginPageResponse(indexHtml)) {
        throw new Error("Session expired: received login page after authentication");
      }

      const token = this.extractToken(indexHtml);
      if (!token) {
        const htmlPreview = indexHtml.substring(0, Math.min(500, indexHtml.length));
        throw new Error(
          `Could not extract token from index page. HTML length: ${indexHtml.length}, preview: ${htmlPreview}`,
        );
      }
      this.token = token;
    });
  }

  async login(maxRetries = 3, baseDelayMs = 500): Promise<void> {
    return withSpan("tplink.login", { "server.address": this.host }, async () => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await this.fetchGDPRParm();

          this.hash = md5Hex(this.username + this.password);

          const aesKey = randomKeyIvPart();
          const aesIv = randomKeyIvPart();

          const userNameB64 = Buffer.from(this.username, "utf8").toString("base64");
          const passwdB64 = Buffer.from(this.password, "utf8").toString("base64");

          const payload = {
            data: {
              UserName: userNameB64,
              Passwd: passwdB64,
              Action: "1",
              stack: "0,0,0,0,0,0",
              pstack: "0,0,0,0,0,0",
            },
            operation: "cgi",
            oid: "/cgi/login",
          };

          const jsonBody = JSON.stringify(payload) + "\r\n";

          const decrypted = await this.postGdpr(jsonBody, true, aesKey, aesIv);

          const retMatch = /\$\.ret\s*=\s*(-?\d+)/.exec(decrypted);
          if (retMatch) {
            const code = parseInt(retMatch[1] ?? "0", 10);
            if (code !== 0) {
              throw new Error(`Login failed, error code ${code}`);
            }
          } else {
            let parsed: unknown;
            try {
              parsed = JSON.parse(decrypted);
            } catch {
              throw new Error(`Unrecognized login response: ${decrypted}`);
            }
            if (!(parsed as { success?: boolean })?.success) {
              throw new Error(`Login failed: ${JSON.stringify(parsed)}`);
            }
          }

          await this.doLogin(aesKey, aesIv);
          return;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (attempt === maxRetries) throw error;
          const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
          console.warn(
            `Login attempt ${attempt}/${maxRetries} failed: ${errorMessage}. Retrying in ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    });
  }

  async call(operation: string, oid: string, data: Record<string, unknown> = {}): Promise<unknown> {
    const payload = { data, operation, oid };
    const jsonBody = JSON.stringify(payload) + "\r\n";
    return withSpan("tplink.call", {
      "server.address": this.host,
      "tplink.operation": operation,
      "tplink.oid": oid,
      "tplink.request.body": jsonBody,
    }, async () => {
      if (!this.aesKey) {
        throw new Error("Not logged in yet - call login() first");
      }

      const decrypted = await this.postGdpr(jsonBody, false, this.aesKey, this.aesIv);

      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    },
    (result, span) => {
      const resultStr = typeof result === "string" ? result : JSON.stringify(result);
      span.setAttribute("tplink.response.body", resultStr);
      span.setAttribute("tplink.response.body.size", resultStr.length);
    });
  }

  add<T>(oid: string, data: Record<string, unknown> = {}) {
    return withSpan("tplink.add", { "server.address": this.host, "tplink.oid": oid }, () => this.call("ao", oid, data)) as Promise<T>;
  }
  get<T>(oid: string, data: Record<string, unknown> = {}) {
    return withSpan("tplink.get", { "server.address": this.host, "tplink.oid": oid }, () => this.call("go", oid, data)) as Promise<T>;
  }
  getList<T>(oid: string, data: Record<string, unknown> = {}) {
    return withSpan("tplink.getList", { "server.address": this.host, "tplink.oid": oid }, () => this.call("gl", oid, data)) as Promise<T>;
  }
  getSubList<T>(oid: string, data: Record<string, unknown> = {}) {
    return withSpan("tplink.getSubList", { "server.address": this.host, "tplink.oid": oid }, () => this.call("gs", oid, data)) as Promise<T>;
  }
  set<T>(oid: string, data: Record<string, unknown> = {}) {
    return withSpan("tplink.set", { "server.address": this.host, "tplink.oid": oid }, () => this.call("so", oid, data)) as Promise<T>;
  }
  del<T>(oid: string, data: Record<string, unknown> = {}) {
    return withSpan("tplink.del", { "server.address": this.host, "tplink.oid": oid }, () => this.call("do", oid, data)) as Promise<T>;
  }
  op<T>(oid: string, data: Record<string, unknown> = {}) {
    return withSpan("tplink.op", { "server.address": this.host, "tplink.oid": oid }, () => this.call("op", oid, data)) as Promise<T>;
  }
}
