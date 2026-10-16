import type { StftTile } from "./comparisonDsp";

/** Byte-bounded LRU across files and viewports; in-flight work is shared. */
export class StftCache {
  private readonly _tiles = new Map<string, StftTile>();
  private readonly _pending = new Map<string, Promise<StftTile | null>>();
  private _bytes = 0;
  private _generation = 0;
  constructor(private readonly _limit = 32 * 1024 * 1024) {}
  get(key: string): StftTile | undefined {
    const tile = this._tiles.get(key);
    if (tile) {
      this._tiles.delete(key);
      this._tiles.set(key, tile);
    }
    return tile;
  }
  load(
    key: string,
    compute: () => Promise<StftTile | null>,
  ): Promise<StftTile | null> {
    const cached = this.get(key);
    if (cached) {
      return Promise.resolve(cached);
    }
    const pending = this._pending.get(key);
    if (pending) {
      return pending;
    }
    const generation = this._generation;
    const promise = compute()
      .then((tile) => {
        if (
          tile &&
          generation === this._generation &&
          tile.values.byteLength <= this._limit
        ) {
          this._tiles.set(key, tile);
          this._bytes += tile.values.byteLength;
          while (this._bytes > this._limit) {
            const oldest = this._tiles.keys().next().value;
            this._bytes -= this._tiles.get(oldest).values.byteLength;
            this._tiles.delete(oldest);
          }
        }
        return generation === this._generation ? tile : null;
      })
      .finally(() => {
        if (this._pending.get(key) === promise) {
          this._pending.delete(key);
        }
      });
    this._pending.set(key, promise);
    return promise;
  }
  cancelPending(): void {
    ++this._generation;
    this._pending.clear();
  }
  clear(): void {
    this.cancelPending();
    this._tiles.clear();
    this._pending.clear();
    this._bytes = 0;
  }
}
