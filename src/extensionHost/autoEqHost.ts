/* eslint-disable @typescript-eslint/naming-convention */

import { request as httpsRequest } from "https";
import { buildAutoEqEqualizePayload } from "../shared/autoEqEqualizePayload";

const BASE_URL = "https://autoeq.app";
const REQUEST_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;
const MAX_ERROR_BODY_CHARS = 300;
/** Hard cap on response body size: guards the extension host against a
    misbehaving endpoint (or hostile proxy) streaming unbounded data. */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export interface AutoEqEqualizeHostBody {
  name: string;
  source: string;
  rig: string;
  target: string;
  fs: number;
}

interface AutoEqRequestOptions {
  method?: string;
  body?: string;
}

/**
 * AutoEq requests deliberately prefer Node's classic https stack over the
 * global (undici) fetch: some extension hosts inject an experimental proxy
 * into the global fetch dispatcher, which surfaced as a bare "fetch failed"
 * here. The https stack follows the OS resolver and is unaffected by that
 * injection; request errors keep their original errno for diagnosis.
 * In webworker extension hosts (no Node https) we fall back to global fetch.
 */
function requestAutoEqJson(
  url: string,
  label: string,
  options: AutoEqRequestOptions = {},
): Promise<unknown> {
  if (typeof httpsRequest === "function") {
    return requestAutoEqJsonViaHttps(url, label, options);
  }
  return requestAutoEqJsonViaFetch(url, label, options);
}

function parseJsonBody(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (parseError) {
    throw new Error(
      `AutoEq ${label} returned invalid JSON: ${String(parseError)}`,
    );
  }
}

/** Stream a fetch response body with a byte cap so a runaway response cannot
    grow without bound in the extension host. */
async function readFetchBodyCapped(
  res: Response,
  label: string,
): Promise<string> {
  if (!res.body) {
    return "";
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        received += value.byteLength;
        if (received > MAX_RESPONSE_BYTES) {
          // A remote stream's cancellation must not delay the size rejection.
          void reader.cancel().catch(() => undefined);
          throw new Error(
            `AutoEq ${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`,
          );
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

async function requestAutoEqJsonViaFetch(
  url: string,
  label: string,
  options: AutoEqRequestOptions,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: options.body,
      signal: controller.signal,
    });
    // The same byte cap and deadline cover every status, including errors.
    const text = await readFetchBodyCapped(res, label);
    if (!res.ok) {
      throw new Error(
        `AutoEq ${label} failed: ${res.status}${
          text ? ` — ${text.slice(0, MAX_ERROR_BODY_CHARS)}` : ""
        }`,
      );
    }
    return parseJsonBody(text, label);
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `AutoEq ${label} request failed: timed out after ${REQUEST_TIMEOUT_MS}ms`,
      );
    }
    const cause = (err as { cause?: { code?: string; message?: string } })
      .cause;
    throw new Error(
      `AutoEq ${label} request failed: ${String(err)}${
        cause ? ` (cause: ${cause.code ?? ""} ${cause.message ?? ""})` : ""
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function requestAutoEqJsonViaHttps(
  url: string,
  label: string,
  options: AutoEqRequestOptions = {},
  redirectsLeft: number = MAX_REDIRECTS,
  deadline: number = Date.now() + REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(
        new Error(
          `AutoEq ${label} request failed: timed out after ${REQUEST_TIMEOUT_MS}ms`,
        ),
      );
      return;
    }
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const succeed = (value: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const req = httpsRequest(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined
            ? {
                "Content-Type": "application/json",
                "Content-Length": String(Buffer.byteLength(options.body)),
              }
            : {}),
        },
      },
      (res) => {
        res.on("error", (error) => {
          fail(error);
          req.destroy();
        });
        const closed = () => {
          if (!settled) {
            fail(
              new Error(`AutoEq ${label} response closed before completion`),
            );
            req.destroy();
          }
        };
        res.on("aborted", closed);
        res.on("close", closed);
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          let nextUrl: URL;
          try {
            if (redirectsLeft <= 0) {
              throw new Error(`AutoEq ${label} exceeded redirect limit`);
            }
            nextUrl = new URL(res.headers.location, url);
            if (nextUrl.protocol !== "https:") {
              throw new Error(`AutoEq ${label} redirect must use HTTPS`);
            }
          } catch (error) {
            fail(error);
            res.destroy();
            return;
          }
          /* Only 307/308 preserve method and body across a redirect; for
             301/302/303 a POST is downgraded to GET (fetch convention) so we
             never re-send the payload where it would be unexpected. */
          const nextOptions: AutoEqRequestOptions =
            options.body !== undefined && status !== 307 && status !== 308
              ? { method: "GET", body: undefined }
              : options;
          succeed(
            requestAutoEqJsonViaHttps(
              nextUrl.toString(),
              label,
              nextOptions,
              redirectsLeft - 1,
              deadline,
            ),
          );
          // Do not drain an arbitrary redirect body after following Location.
          res.destroy();
          return;
        }
        const chunks: Uint8Array[] = [];
        let received = 0;
        res.on("data", (chunk: Uint8Array) => {
          if (settled) {
            return;
          }
          received += chunk.byteLength;
          if (received > MAX_RESPONSE_BYTES) {
            fail(
              new Error(
                `AutoEq ${label} response exceeded ${MAX_RESPONSE_BYTES} bytes`,
              ),
            );
            res.destroy();
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) {
            return;
          }
          const text = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            fail(
              new Error(
                `AutoEq ${label} failed: ${status}${
                  text ? ` — ${text.slice(0, MAX_ERROR_BODY_CHARS)}` : ""
                }`,
              ),
            );
            return;
          }
          try {
            succeed(parseJsonBody(text, label));
          } catch (parseError) {
            fail(parseError);
          }
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) => {
      fail(
        new Error(
          `AutoEq ${label} request failed: ${
            err.code ? `${err.code} — ` : ""
          }${err.message}`,
        ),
      );
    });
    // Socket inactivity timers reset on traffic. Use an independent deadline
    // covering DNS, headers and the full body, shared by all redirect hops.
    const timer = setTimeout(() => {
      const error = new Error(
        `AutoEq ${label} request failed: timed out after ${REQUEST_TIMEOUT_MS}ms`,
      );
      fail(error);
      req.destroy();
    }, remaining);
    try {
      if (options.body !== undefined) {
        req.write(options.body);
      }
      req.end();
    } catch (error) {
      fail(error);
      req.destroy();
    }
  });
}

export async function fetchAutoEqEntriesInHost(): Promise<unknown> {
  return requestAutoEqJson(`${BASE_URL}/entries`, "entries");
}

export async function fetchAutoEqTargetsInHost(): Promise<unknown> {
  return requestAutoEqJson(`${BASE_URL}/targets`, "targets");
}

export async function equalizeAutoEqInHost(
  body: AutoEqEqualizeHostBody,
): Promise<unknown> {
  return requestAutoEqJson(`${BASE_URL}/equalize`, "equalize", {
    method: "POST",
    body: JSON.stringify(buildAutoEqEqualizePayload(body)),
  });
}
