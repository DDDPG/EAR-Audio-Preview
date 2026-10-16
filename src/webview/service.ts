import { Disposable } from "../dispose";

/** Native event semantics, with all registrations owned by this service. */
export default class Service extends Disposable implements EventTarget {
  private readonly _eventTarget = new EventTarget();
  private _registrations: {
    type: string;
    listener: EventListenerOrEventListenerObject;
    capture: boolean;
  }[] = [];

  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!this._isDisposed) {
      this._eventTarget.addEventListener(type, listener, options);
      const capture =
        typeof options === "boolean" ? options : !!options?.capture;
      if (
        listener &&
        !this._registrations.some(
          (entry) =>
            entry.type === type &&
            entry.listener === listener &&
            entry.capture === capture,
        )
      ) {
        this._registrations.push({ type, listener, capture });
      }
    }
  }

  public dispatchEvent(event: Event): boolean {
    return this._eventTarget.dispatchEvent(event);
  }

  public removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    this._eventTarget.removeEventListener(type, listener, options);
    const capture = typeof options === "boolean" ? options : !!options?.capture;
    this._registrations = this._registrations.filter(
      (entry) =>
        !(
          entry.type === type &&
          entry.listener === listener &&
          entry.capture === capture
        ),
    );
  }

  public dispose(): void {
    // Release listeners, including object listeners and signal registrations.
    for (const { type, listener, capture } of this._registrations) {
      this._eventTarget.removeEventListener(type, listener, capture);
    }
    this._registrations = [];
    super.dispose();
  }
}
