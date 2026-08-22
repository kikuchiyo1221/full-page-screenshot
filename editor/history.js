// Undo/redo stack holding serialized annotation snapshots.

const DEFAULT_MAX_ENTRIES = 50;

export class History {
  #entries = [];
  #index = -1;
  #maxEntries;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.#maxEntries = maxEntries;
  }

  get canUndo() {
    return this.#index > 0;
  }

  get canRedo() {
    return this.#index < this.#entries.length - 1;
  }

  /** Record a snapshot, discarding any redo entries beyond the current position. */
  push(state) {
    this.#entries = this.#entries.slice(0, this.#index + 1);
    this.#entries.push(JSON.stringify(state));
    this.#index += 1;

    if (this.#entries.length > this.#maxEntries) {
      this.#entries.shift();
      this.#index -= 1;
    }
  }

  /** @returns {*|null} the previous snapshot, or null if there is none. */
  undo() {
    if (!this.canUndo) return null;
    this.#index -= 1;
    return this.#current();
  }

  /** @returns {*|null} the next snapshot, or null if there is none. */
  redo() {
    if (!this.canRedo) return null;
    this.#index += 1;
    return this.#current();
  }

  #current() {
    return JSON.parse(this.#entries[this.#index]);
  }
}
