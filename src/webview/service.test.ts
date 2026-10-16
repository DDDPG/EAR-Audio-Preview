import Service from "./service";

describe("Service native events", () => {
  test("supports listener objects and suppresses duplicate registrations", () => {
    const service = new Service();
    const listener = { handleEvent: jest.fn() };
    service.addEventListener("change", listener);
    service.addEventListener("change", listener);
    service.dispatchEvent(new Event("change"));
    expect(listener.handleEvent).toHaveBeenCalledTimes(1);
    service.removeEventListener("change", listener);
    service.dispatchEvent(new Event("change"));
    expect(listener.handleEvent).toHaveBeenCalledTimes(1);
  });

  test("supports once, cancellation, and abort signals", () => {
    const service = new Service();
    const controller = new AbortController();
    const once = jest.fn((event: Event) => event.preventDefault());
    const aborted = jest.fn();
    service.addEventListener("change", once, { once: true });
    service.addEventListener("change", aborted, { signal: controller.signal });
    controller.abort();
    expect(
      service.dispatchEvent(new Event("change", { cancelable: true })),
    ).toBe(false);
    expect(
      service.dispatchEvent(new Event("change", { cancelable: true })),
    ).toBe(true);
    expect(once).toHaveBeenCalledTimes(1);
    expect(aborted).not.toHaveBeenCalled();
  });

  test("removal during dispatch and disposal stop remaining callbacks", () => {
    const service = new Service();
    const second = jest.fn();
    service.addEventListener("change", () =>
      service.removeEventListener("change", second),
    );
    service.addEventListener("change", second);
    service.dispatchEvent(new Event("change"));
    expect(second).not.toHaveBeenCalled();
    service.dispose();
    const late = jest.fn();
    service.addEventListener("change", late);
    service.dispatchEvent(new Event("change"));
    expect(late).not.toHaveBeenCalled();
  });
});

test("service disposal during dispatch removes later listeners", () => {
  const service = new Service();
  const later = jest.fn();
  service.addEventListener("change", () => service.dispose());
  service.addEventListener("change", later);
  service.dispatchEvent(new Event("change"));
  expect(later).not.toHaveBeenCalled();
});

test("service preserves capture registrations when removing a bubble listener", () => {
  const service = new Service();
  const listener = jest.fn();
  service.addEventListener("change", listener, true);
  service.addEventListener("change", listener, false);
  service.removeEventListener("change", listener, false);
  service.dispatchEvent(new Event("change"));
  expect(listener).toHaveBeenCalledTimes(1);
  service.dispose();
  service.dispatchEvent(new Event("change"));
  expect(listener).toHaveBeenCalledTimes(1);
});
