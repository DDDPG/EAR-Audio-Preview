/** @jest-environment node */
import { EventEmitter } from "events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "http";

type Host = typeof import("./autoEqHost");
const timeoutMs = 20000;
const maxBytes = 32 * 1024 * 1024;
const originalFetch = globalThis.fetch;
const requestMock = jest.fn();
let requests: ReturnType<typeof makeRequest>[];

function makeRequest() {
  const req = new EventEmitter() as EventEmitter & {
    setTimeout: jest.Mock;
    destroy: jest.Mock;
    write: jest.Mock;
    end: jest.Mock;
  };
  req.setTimeout = jest.fn();
  req.destroy = jest.fn((error?: Error) => {
    if (error) {
      req.emit("error", error);
    }
    return req;
  });
  req.write = jest.fn();
  req.end = jest.fn();
  return req;
}

function makeResponse(status = 200, location?: string) {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    headers: { location?: string };
    resume: jest.Mock;
    destroy: jest.Mock;
  };
  res.statusCode = status;
  res.headers = { location };
  res.resume = jest.fn();
  res.destroy = jest.fn();
  return res;
}

function loadHost(browser = false): Host {
  jest.resetModules();
  jest.doMock("https", () => ({ request: browser ? undefined : requestMock }));
  return jest.requireActual("./autoEqHost") as Host;
}

function respond(index: number, status = 200, location?: string) {
  const res = makeResponse(status, location);
  const callback = requestMock.mock.calls[index][2] as (
    res: IncomingMessage,
  ) => void;
  callback(res as unknown as IncomingMessage);
  return res;
}

function finish(res: ReturnType<typeof makeResponse>, body: string) {
  res.emit("data", Buffer.from(body));
  res.emit("end");
  res.emit("close");
}

beforeEach(() => {
  jest.useFakeTimers();
  requests = [];
  requestMock.mockReset().mockImplementation(() => {
    const req = makeRequest();
    requests.push(req);
    return req as unknown as ClientRequest;
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("Node AutoEq requests", () => {
  test("ordinary JSON succeeds and releases its deadline timer", async () => {
    const result = loadHost().fetchAutoEqEntriesInHost();
    finish(respond(0), '{"headphones":[]}');
    await expect(result).resolves.toEqual({ headphones: [] });
    expect(requestMock.mock.calls[0][0]).toBe("https://autoeq.app/entries");
    expect(jest.getTimerCount()).toBe(0);
  });

  test("slow-drip data cannot extend the total deadline", async () => {
    const result = loadHost()
      .fetchAutoEqEntriesInHost()
      .catch((e) => e);
    const res = respond(0);
    try {
      for (let i = 0; i < 4; i++) {
        res.emit("data", Buffer.from(" "));
        jest.advanceTimersByTime(5000);
      }
      expect(requests[0].destroy).toHaveBeenCalled();
      expect(await result).toEqual(
        expect.objectContaining({
          message: expect.stringContaining("timed out"),
        }),
      );
    } finally {
      finish(res, "{}");
      await result;
    }
  });

  test("redirects share the original total deadline", async () => {
    const result = loadHost()
      .fetchAutoEqTargetsInHost()
      .catch((e) => e);
    jest.advanceTimersByTime(15000);
    const redirected = respond(0, 302, "/new-targets");
    const res = respond(1);
    try {
      jest.advanceTimersByTime(5000);
      expect(requests[1].destroy).toHaveBeenCalled();
      expect(redirected.destroy).toHaveBeenCalled();
      expect(await result).toEqual(
        expect.objectContaining({
          message: expect.stringContaining("timed out"),
        }),
      );
    } finally {
      finish(res, "{}");
      await result;
    }
  });

  test.each([301, 302, 303, 307, 308])(
    "redirect %i preserves fetch method/body semantics",
    async (status) => {
      const result = loadHost().equalizeAutoEqInHost({
        name: "H",
        source: "S",
        rig: "R",
        target: "T",
        fs: 48000,
      });
      respond(0, status, "/equalize-v2");
      finish(respond(1), "{}");
      await expect(result).resolves.toEqual({});
      const preserved = status === 307 || status === 308;
      expect((requestMock.mock.calls[1][1] as RequestOptions).method).toBe(
        preserved ? "POST" : "GET",
      );
      expect(requests[1].write.mock.calls).toEqual(
        preserved ? requests[0].write.mock.calls : [],
      );
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  test.each(["https://[", "http://autoeq.app/insecure"])(
    "rejects unsafe redirect %s without escaping the callback",
    async (location) => {
      const result = loadHost()
        .fetchAutoEqEntriesInHost()
        .catch((e) => e);
      expect(() => respond(0, 302, location)).not.toThrow();
      expect(await result).toEqual(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  test.each(["aborted", "close"])(
    "rejects a prematurely %s response",
    async (event) => {
      const result = loadHost()
        .fetchAutoEqEntriesInHost()
        .catch((e) => e);
      const res = respond(0);
      res.emit(event);
      expect(await result).toEqual(
        expect.objectContaining({
          message: expect.stringMatching(/closed|aborted/),
        }),
      );
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  test.each([200, 503])("caps response bytes for HTTP %i", async (status) => {
    const result = loadHost()
      .fetchAutoEqEntriesInHost()
      .catch((e) => e);
    respond(0, status).emit("data", new Uint8Array(maxBytes + 1));
    expect(await result).toEqual(
      expect.objectContaining({ message: expect.stringContaining("exceeded") }),
    );
    expect(requests[0].destroy).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("keeps HTTP diagnostics and JSON validation", async () => {
    const host = loadHost();
    const error = host.fetchAutoEqEntriesInHost().catch((e) => e);
    finish(respond(0, 503), "temporarily unavailable");
    expect(((await error) as Error).message).toContain(
      "503 — temporarily unavailable",
    );
    const invalid = host.fetchAutoEqTargetsInHost().catch((e) => e);
    finish(respond(1), "not json");
    expect(((await invalid) as Error).message).toContain("invalid JSON");
  });

  test("times out before headers, preserves network errno, and bounds redirects", async () => {
    const host = loadHost();
    const pending = host.fetchAutoEqEntriesInHost().catch((e) => e);
    jest.advanceTimersByTime(timeoutMs);
    expect(await pending).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("timed out"),
      }),
    );
    const network = host.fetchAutoEqEntriesInHost().catch((e) => e);
    requests[1].emit(
      "error",
      Object.assign(new Error("unreachable"), { code: "ENETUNREACH" }),
    );
    expect(await network).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("ENETUNREACH"),
      }),
    );
    const redirects = host.fetchAutoEqEntriesInHost().catch((e) => e);
    for (let i = 2; i < 6; i++) {
      respond(i, 302, "/loop");
    }
    expect(await redirects).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("redirect limit"),
      }),
    );
    expect(requestMock).toHaveBeenCalledTimes(6);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("Browser AutoEq requests", () => {
  test.each([200, 503])(
    "slow body after HTTP %i headers still times out",
    async (status) => {
      let controller: ReadableStreamDefaultController<Uint8Array>;
      let signal: AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      });
      globalThis.fetch = jest.fn(async (_url, options) => {
        signal = options.signal;
        signal.addEventListener("abort", () =>
          controller.error(new Error("aborted")),
        );
        return new Response(body, { status });
      });
      const result = loadHost(true)
        .fetchAutoEqEntriesInHost()
        .catch((e) => e);
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(timeoutMs);
      try {
        expect(signal.aborted).toBe(true);
        expect(((await result) as Error).message).toContain("timed out");
      } finally {
        if (!signal.aborted) {
          controller.close();
        }
        await result;
      }
    },
  );

  test.each([200, 503])(
    "caps body bytes for HTTP %i and cancels the stream",
    async (status) => {
      // A stuck cancellation promise must not prevent rejection on overflow.
      const cancel = jest.fn(() => new Promise<void>(() => undefined));
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array(maxBytes + 1));
        },
        cancel,
      });
      globalThis.fetch = jest.fn(async () => new Response(body, { status }));
      const result = loadHost(true)
        .fetchAutoEqEntriesInHost()
        .catch((e) => e);
      expect(((await result) as Error).message).toContain("exceeded");
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(body.locked).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  test("ordinary JSON and short error diagnostics remain intact", async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('{"ok":true}'))
      .mockResolvedValueOnce(
        new Response("upstream unavailable", { status: 502 }),
      );
    const host = loadHost(true);
    await expect(host.fetchAutoEqEntriesInHost()).resolves.toEqual({
      ok: true,
    });
    await expect(host.fetchAutoEqTargetsInHost()).rejects.toThrow(
      "502 — upstream unavailable",
    );
    expect(jest.getTimerCount()).toBe(0);
  });
});
