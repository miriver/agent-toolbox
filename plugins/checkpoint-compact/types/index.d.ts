/** A compaction the model asked for, held until the session accepts or refuses it. */
export type CompactRequest = {
  /**
   * The id of the tool call that made the request. A compaction in flight clears
   * the request only while it still holds this id, so it never clears a newer one.
   */
  id: string
  /** What the summary must keep; absent when the model gave none. */
  instructions?: string
  /**
   * True once the turn that asked has ended and /compact is on its way: a later
   * turn end must not queue it again.
   */
  isDispatched?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'checkpoint-compact': {
      /** The pending request, or null when none is pending. */
      request: CompactRequest | null
    }
  }
}
