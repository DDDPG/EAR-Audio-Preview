import { AnalysisTaskQueue } from "./analysisTaskQueue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("serializes host work and cancels queued jobs without starting them", async () => {
  const queue = new AnalysisTaskQueue();
  const firstOwner = {};
  const secondOwner = {};
  const gate = deferred();
  let cancelled!: () => boolean;
  const first = queue.run(firstOwner, "1", async (shouldCancel) => {
    cancelled = shouldCancel;
    await gate.promise;
  });
  const skipped = jest.fn(async () => {});
  const next = jest.fn(async () => {});
  const second = queue.run(firstOwner, "2", skipped);
  const third = queue.run(secondOwner, "3", next);
  await Promise.resolve();
  expect(next).not.toHaveBeenCalled();
  queue.cancel(firstOwner);
  await second;
  expect(cancelled()).toBe(true);
  expect(skipped).not.toHaveBeenCalled();
  gate.resolve();
  await Promise.all([first, third]);
  expect(next).toHaveBeenCalledTimes(1);
});

test("request cancellation is scoped to its page and rejected jobs release the queue", async () => {
  const queue = new AnalysisTaskQueue();
  const owner = {};
  const gate = deferred();
  let cancelled!: () => boolean;
  const first = queue.run(owner, "same-id", async (shouldCancel) => {
    cancelled = shouldCancel;
    await gate.promise;
    throw new Error("analysis failed");
  });
  const rejection = expect(first).rejects.toThrow("analysis failed");
  await Promise.resolve();
  queue.cancel({}, "same-id");
  expect(cancelled()).toBe(false);
  const next = jest.fn(async () => {});
  const second = queue.run({}, "same-id", next);
  gate.resolve();
  await rejection;
  await second;
  expect(next).toHaveBeenCalledTimes(1);
});

test("replacement cancels the previous task while a stale page cannot cancel the new page", async () => {
  const queue = new AnalysisTaskQueue();
  const oldOwner = {};
  const nextOwner = {};
  const gate = deferred();
  let firstCancelled!: () => boolean;
  const first = queue.run(oldOwner, "same", async (cancelled) => {
    firstCancelled = cancelled;
    await gate.promise;
  });
  await Promise.resolve();
  const superseded = jest.fn(async () => {});
  const second = queue.run(oldOwner, "same", superseded);
  const third = queue.run(oldOwner, "same", async () => {});
  await second;
  expect(firstCancelled()).toBe(true);
  expect(superseded).not.toHaveBeenCalled();
  let nextCancelled!: () => boolean;
  const nextGate = deferred();
  const fourth = queue.run(nextOwner, "same", async (cancelled) => {
    nextCancelled = cancelled;
    await nextGate.promise;
  });
  gate.resolve();
  await Promise.all([first, third]);
  await Promise.resolve();
  queue.cancel(oldOwner, "same");
  expect(nextCancelled()).toBe(false);
  nextGate.resolve();
  await fourth;
});
