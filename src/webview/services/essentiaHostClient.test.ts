import { PageRpcClient } from "./pageRpcClient";
import EssentiaHostClient from "./essentiaHostClient";
import {
  ExtMessageType,
  WebviewMessageType,
  WebviewAnalyzeStftMessageData,
} from "../../message";

const settings = {
  windowSize: 8,
  windowType: "hann",
  hopSize: 4,
  minTime: 0,
  maxTime: 1,
  minFrequency: 0,
  maxFrequency: 4,
};
function respond(
  rpc: PageRpcClient,
  data: WebviewAnalyzeStftMessageData,
  value: number,
) {
  rpc.handleResponse({
    type: ExtMessageType.STFT_RESULT,
    data: {
      requestId: data.requestId,
      payload: {
        frameCount: 1,
        binCount: 1,
        dbValues: new Float32Array([value]).buffer,
      },
    },
  });
}

test("new audio client cannot reuse another audio's same-size cached spectrum", async () => {
  const post = jest.fn();
  const rpc = new PageRpcClient(post);
  const first = new EssentiaHostClient(rpc);
  const pending = first.requestStft(0, new Float32Array(8), 8, settings);
  respond(rpc, post.mock.calls[0][0].data, -10);
  await pending;
  const next = new EssentiaHostClient(rpc);
  expect(next.getCached(0, 8, 8, settings)).toBeUndefined();
  const updated = next.requestStft(0, new Float32Array(8).fill(1), 8, settings);
  expect(post).toHaveBeenCalledTimes(2);
  respond(rpc, post.mock.calls[1][0].data, -20);
  expect(await updated).toEqual([[-20]]);
});

test("disposing settles pending work and ignores late replies without poisoning new audio", async () => {
  const post = jest.fn();
  const rpc = new PageRpcClient(post);
  const first = new EssentiaHostClient(rpc);
  const pending = first.requestStft(0, new Float32Array(8), 8, settings);
  const oldRequest = post.mock.calls[0][0].data;
  first.dispose();
  expect(await pending).toBeNull();
  const next = new EssentiaHostClient(rpc);
  respond(rpc, oldRequest, -99);
  expect(next.getCached(0, 8, 8, settings)).toBeUndefined();
  expect(first.getCached(0, 8, 8, settings)).toBeUndefined();
  expect(
    await first.requestStft(0, new Float32Array(8), 8, settings),
  ).toBeNull();
  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls[1][0]).toEqual({
    type: WebviewMessageType.CANCEL_ANALYSIS,
    data: { requestId: oldRequest.requestId },
  });
});

test("derived M/S audio does not share the L/R spectrum cache", async () => {
  const post = jest.fn();
  const rpc = new PageRpcClient(post);
  const client = new EssentiaHostClient(rpc);
  const pending = client.requestStft(0, new Float32Array(8), 8, settings, 1);
  respond(rpc, post.mock.calls[0][0].data, -10);
  await pending;
  expect(client.getCached(0, 8, 8, settings, 1)).toEqual([[-10]]);
  expect(client.getCached(0, 8, 8, settings, 2)).toBeUndefined();
  client.dispose();
});
