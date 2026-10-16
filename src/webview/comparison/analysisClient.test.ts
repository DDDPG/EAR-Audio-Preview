import { ComparisonAnalysisClient } from "./analysisClient";
import type { AnalysisJob } from "./analysisProtocol";

function harness() {
  const worker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: jest.fn(),
    terminate: jest.fn(),
  };
  const client = new ComparisonAnalysisClient(worker as unknown as Worker);
  const job: Omit<AnalysisJob, "id"> = {
    kind: "live",
    trackId: "a",
    audioRevision: 1,
    settingsRevision: 1,
    audio: { left: new Float32Array(8), sampleRate: 48000, origin: 0 },
    time: 0,
    options: {
      windowMs: 80,
      minHz: 20,
      maxHz: 24000,
      bins: 16,
      tiltDbPerOct: 0,
      weighting: "none",
    },
  };
  return { client, worker, job };
}

test.each(["onerror", "onmessageerror"] as const)(
  "%s settles current requests and prevents later requests from hanging",
  async (event) => {
    const { client, worker, job } = harness();
    const pending = client.request(job);
    worker[event](new Event("error"));
    await expect(pending).resolves.toBeNull();
    expect(client["_pending"].size).toBe(0);
    const postCount = worker.postMessage.mock.calls.length;
    const settle = jest.fn();
    void client.request(job).then(settle);
    await Promise.resolve();
    expect(settle).toHaveBeenCalledWith(null);
    expect(worker.postMessage).toHaveBeenCalledTimes(postCount);
    client.dispose();
  },
);

test("cancel and disposal settle requests even if worker messaging throws", async () => {
  const { client, worker, job } = harness();
  const pending = client.request(job);
  worker.postMessage.mockImplementation(() => {
    throw new Error("Worker is unavailable");
  });
  expect(() => client.cancel()).not.toThrow();
  await expect(pending).resolves.toBeNull();
  expect(client["_pending"].size).toBe(0);
  worker.postMessage.mockReset();
  const beforeDispose = client.request(job);
  expect(() => client.dispose()).not.toThrow();
  await expect(beforeDispose).resolves.toBeNull();
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(client["_pending"].size).toBe(0);
  await expect(client.request(job)).resolves.toBeNull();
  client.dispose();
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});

test("Essentia jobs use the host bridge and Ooura jobs stay in the CSP-safe worker", async () => {
  const { worker, job } = harness();
  const post = jest.fn();
  const client = new ComparisonAnalysisClient(
    worker as unknown as Worker,
    post,
  );
  const hostJob = {
    ...job,
    options: { ...job.options, fftBackend: "essentia" as const },
  };
  const hosted = client.request(hostJob);
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(post.mock.calls[0][0]).toMatchObject({
    type: "compare.analysis",
    job: { id: 1, options: { fftBackend: "essentia" } },
  });
  client.handleHostResponse({
    ...post.mock.calls[0][0].job,
    error: "test host error",
  });
  await expect(hosted).resolves.toMatchObject({ error: "test host error" });
  const native = client.request(job);
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  client.cancel();
  await expect(native).resolves.toBeNull();
  client.dispose();
});

test("cancelling host analysis settles its wait and ignores late replies", async () => {
  const { worker, job } = harness();
  const post = jest.fn();
  const client = new ComparisonAnalysisClient(
    worker as unknown as Worker,
    post,
  );
  const result = client.request({
    ...job,
    options: { ...job.options, fftBackend: "essentia" },
  });
  client.dispose();
  await expect(result).resolves.toBeNull();
  expect(post.mock.calls[1][0]).toEqual({
    type: "compare.cancelAnalysis",
    id: 1,
  });
  expect(() =>
    client.handleHostResponse(post.mock.calls[0][0].job),
  ).not.toThrow();
  expect(client["_pending"].size).toBe(0);
});
