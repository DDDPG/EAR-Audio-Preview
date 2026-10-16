import { StftCache } from "./stftCache";
const tile = () => ({
  values: new Float32Array(4),
  columns: 2,
  bins: 2,
  start: 0,
  end: 1,
});
test("shares pending work and caches completed viewports", async () => {
  const cache = new StftCache();
  let resolve: (value: ReturnType<typeof tile>) => void;
  const compute = jest.fn(
    () =>
      new Promise<ReturnType<typeof tile>>((done) => {
        resolve = done;
      }),
  );
  const first = cache.load("a", compute);
  expect(cache.load("a", compute)).toBe(first);
  resolve(tile());
  const result = await first;
  expect(await cache.load("a", compute)).toBe(result);
  expect(compute).toHaveBeenCalledTimes(1);
});
test("evicts the least recently used entry within a byte budget", async () => {
  const cache = new StftCache(32);
  await cache.load("a", async () => tile());
  await cache.load("b", async () => tile());
  cache.get("a");
  await cache.load("c", async () => tile());
  expect(cache.get("a")).toBeDefined();
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("c")).toBeDefined();
});
test("cancelled work cannot repopulate cache or erase its replacement", async () => {
  const cache = new StftCache();
  let resolve: (value: ReturnType<typeof tile>) => void;
  const old = cache.load(
    "a",
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  cache.cancelPending();
  const replacement = tile();
  await cache.load("a", async () => replacement);
  resolve(tile());
  expect(await old).toBeNull();
  expect(cache.get("a")).toBe(replacement);
});
