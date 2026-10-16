import { retainComparisonScroll } from "./scrollState";
test("waits for async layout then restores scroll without overwriting saved state", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const scroller = document.documentElement;
  const height = jest
    .spyOn(scroller, "scrollHeight", "get")
    .mockReturnValue(200);
  jest.spyOn(scroller, "clientHeight", "get").mockReturnValue(200);
  const save = jest.fn();
  const cleanup = retainComparisonScroll(root, { top: 600, left: 0 }, save);
  window.dispatchEvent(new Event("scroll"));
  expect(save).not.toHaveBeenCalled();
  height.mockReturnValue(1200);
  root.append(document.createElement("canvas"));
  await Promise.resolve();
  expect(scroller.scrollTop).toBe(600);
  window.dispatchEvent(new Event("scroll"));
  expect(save).toHaveBeenCalledWith({ top: 600, left: 0 });
  cleanup();
  root.remove();
  jest.restoreAllMocks();
});
test("user scrolling cancels deferred restoration", async () => {
  const root = document.createElement("div");
  const scroller = document.documentElement;
  const height = jest
    .spyOn(scroller, "scrollHeight", "get")
    .mockReturnValue(200);
  jest.spyOn(scroller, "clientHeight", "get").mockReturnValue(200);
  scroller.scrollTop = 0;
  const cleanup = retainComparisonScroll(
    root,
    { top: 600, left: 0 },
    jest.fn(),
  );
  window.dispatchEvent(new Event("wheel"));
  height.mockReturnValue(1200);
  root.append(document.createElement("canvas"));
  await Promise.resolve();
  expect(scroller.scrollTop).toBe(0);
  cleanup();
  jest.restoreAllMocks();
});
