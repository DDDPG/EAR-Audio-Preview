import {
  ExtMessageType,
  WebviewMessageType,
  type WebviewMessage,
} from "../../message";
import { PageRpcClient } from "./pageRpcClient";
import AutoEqHostClient from "./autoEqHostClient";
import EqPresetHostClient from "./eqPresetHostClient";

function connection() {
  const sent: WebviewMessage[] = [];
  const rpc = new PageRpcClient((message) => sent.push(message));
  const request = () =>
    new AutoEqHostClient(rpc).request({ endpoint: "entries" });
  const reply = (payload: unknown, index = 0) => ({
    type: ExtMessageType.AUTOEQ_RESULT,
    data: {
      requestId: (sent[index] as { data: { requestId: string } }).data
        .requestId,
      payload,
    },
  });
  return { sent, rpc, request, reply };
}

afterEach(() => jest.useRealTimers());

test("one page routes only replies of the matching request and type", async () => {
  const { rpc, request, reply } = connection();
  const promise = request();
  expect(
    rpc.handleResponse({
      ...reply(1),
      type: ExtMessageType.EQ_PRESET_OP_RESULT,
    }),
  ).toBe(false);
  expect(rpc.handleResponse(reply({ ok: true }))).toBe(true);
  await expect(promise).resolves.toEqual({ ok: true });
  expect(rpc.handleResponse(reply(2))).toBe(false);
  rpc.dispose();
});

test("destroying one page rejects its waits without touching a rebuilt page", async () => {
  const first = connection(),
    second = connection();
  const old = first.request();
  const rejected = expect(old).rejects.toThrow(/disposed/);
  const current = second.request();
  first.rpc.dispose();
  await rejected;
  expect(second.rpc.handleResponse(first.reply("old"))).toBe(false);
  second.rpc.handleResponse(second.reply("new"));
  await expect(current).resolves.toBe("new");
  await expect(first.request()).rejects.toThrow(/disposed/);
  first.rpc.dispose();
  second.rpc.dispose();
});

test("host errors settle the request and release its timeout", async () => {
  jest.useFakeTimers();
  const { rpc, request, reply } = connection();
  const promise = request();
  const rejected = expect(promise).rejects.toThrow("offline");
  rpc.handleResponse({
    ...reply(undefined),
    data: { ...reply(undefined).data, error: "offline" },
  });
  await rejected;
  expect(jest.getTimerCount()).toBe(0);
  rpc.dispose();
});

test("synchronous send failure removes the pending request", async () => {
  jest.useFakeTimers();
  const rpc = new PageRpcClient(() => {
    throw new Error("send failed");
  });
  await expect(
    new AutoEqHostClient(rpc).request({ endpoint: "entries" }),
  ).rejects.toThrow("send failed");
  expect(jest.getTimerCount()).toBe(0);
  rpc.dispose();
});

test("network work has a bounded wait; late replies are discarded", async () => {
  jest.useFakeTimers();
  const { rpc, request, reply } = connection();
  const promise = request();
  const rejected = expect(promise).rejects.toThrow(/timed out/);
  jest.advanceTimersByTime(30000);
  await rejected;
  expect(rpc.handleResponse(reply("late"))).toBe(false);
  rpc.dispose();
});

test("user file dialogs remain pending beyond network timeout and settle on response", async () => {
  jest.useFakeTimers();
  const { rpc, sent } = connection();
  const client = new EqPresetHostClient(rpc);
  const imported = client.importFile();
  const writing = client.writeWorkspacePreset({});
  const listed = client.listWorkspacePresets();
  const timedOut = expect(listed).rejects.toThrow(/timed out/);
  jest.advanceTimersByTime(120000);
  await timedOut;
  for (let i = 0; i < 2; i++) {
    const message = sent[i];
    expect(message.type).toBe(WebviewMessageType.EQ_PRESET_OP);
    rpc.handleResponse({
      type: ExtMessageType.EQ_PRESET_OP_RESULT,
      data: {
        requestId: (message as { data: { requestId: string } }).data.requestId,
        payload: { fileName: "preset.json", content: "{}" },
      },
    });
  }
  await expect(imported).resolves.toMatchObject({ fileName: "preset.json" });
  await expect(writing).resolves.toMatchObject({ fileName: "preset.json" });
  expect(jest.getTimerCount()).toBe(0);
  rpc.dispose();
});

test("dispose clears all timers for network and file requests", async () => {
  jest.useFakeTimers();
  const { rpc, request } = connection();
  const network = expect(request()).rejects.toThrow(/disposed/);
  const file = expect(new EqPresetHostClient(rpc).importFile()).rejects.toThrow(
    /disposed/,
  );
  rpc.dispose();
  await Promise.all([network, file]);
  expect(jest.getTimerCount()).toBe(0);
});
