import type { EngineInterface, Register } from 'claude-code'

import type { CompactRequest } from '../types'

// The pending request lives in $.state, not in a module variable: a hot reload
// of this module starts its variables over and keeps $.state.
const request = { plugin: 'session-controls', key: 'request' } as const

// How long after a turn ends the mod waits before it queues /compact. The queue
// call is refused inside a hook the turn waits on, so the mod makes it from a
// timer, which is a dispatch of its own, not from turn.complete.
const DISPATCH_DELAY_MS = 500

const DESCRIPTION = [
  'Compact this conversation at a natural checkpoint, so a long session stops paying to re-read all of it on every request.',
  'Call it only when both hold: you have just finished a unit of work and the next step starts fresh, and everything that matters from this conversation is already written somewhere durable (a tracking issue, a memory or notes file, a PR, a commit, a file in the repo).',
  'Compaction is a trade: it pays only when the conversation is large, much work remains, and the next step needs little of what came before. Do not write long notes just so you can compact, and afterwards read only what the next step needs; the session-controls skill has the full guidance.',
  'Never call it in the middle of a task, or when the only record of a decision is this conversation. Waiting on subagents or background work is fine if `instructions` carries what you need to pick their results back up, such as their task or agent IDs.',
  'The compaction does not run during this call. It runs when your turn ends, so finish the turn right after calling it, with a short sign-off and no further tool calls.',
  'Afterwards this conversation is replaced by a summary, so continue from the durable record, not from your memory of this conversation.',
  '`instructions` (optional) tells the summary what must survive: for example the issue or PR to continue from, the next step, and any decision not yet written down.',
].join(' ')

const ANSWER =
  'Compaction requested. It runs when this turn ends, not now. Finish the turn with a short sign-off and make no further tool calls: anything you do after this call is still in the conversation being compacted. ' +
  'Afterwards this conversation is replaced by a summary; continue from the durable record (issue, memory, PR), not from memory of this conversation.'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'compact_at_checkpoint',
      description: DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          instructions: {
            type: 'string',
            description:
              'What the summary must keep, for example the issue or PR to continue from, the next step, decisions not yet written down.',
          },
        },
      },
      // The model should see the tool without searching for it.
      isDeferred: false,
    })
    // A reload runs this again and drops its timers: a request that was on its
    // way would stay marked as dispatched for good.
    await $.state.set(request, null)

    return next(e)
  })

  // A compaction cannot run during a turn, so the call only records the
  // request; turn.complete acts on it.
  on(
    'tool.call',
    { tool: 'mcp__session-controls__compact_at_checkpoint' },
    async ($, e) => {
      if (e.agentId !== undefined) {
        return {
          deny: 'compact_at_checkpoint compacts the main conversation, so a subagent cannot call it.',
        }
      }

      const instructions =
        typeof e.instructions === 'string' ? e.instructions.trim() : ''
      const pending: CompactRequest =
        instructions === ''
          ? { id: e.tool_use_id }
          : { id: e.tool_use_id, instructions }
      await $.state.set(request, pending)
      $.ui.status('Compaction queued for the end of this turn')

      return { result: ANSWER }
    },
  ).catch(() => ({
    deny: 'session-controls could not record the request, so nothing will be compacted.',
  }))

  on('turn.complete', async ($, e, next) => {
    const answer = await next(e)

    // A subagent's turn ends here too; the request belongs to the main loop.
    if (e.agentId !== undefined) {
      return answer
    }

    const held = await $.state.get(request)
    const pending = held.value
    // Nothing was asked, or the compaction is already on its way.
    if (pending === undefined || pending === null || pending.isDispatched === true) {
      return answer
    }

    // Compaction drops the conversation for a summary; do it only after a turn
    // that ended with an answer, not one the person interrupted or that failed.
    if (e.reason !== 'answer') {
      const dropped = await $.state.set(request, null, { ifVersion: held.version })
      if (dropped.isSet) {
        $.ui.status(undefined)
        $.ui.toast(
          `Checkpoint compaction cancelled: the turn ended without an answer (${e.reason}).`,
          { timeoutMs: 8000 },
        )
      }

      return answer
    }

    // Mark the request as on its way before anything else, so one turn end
    // queues it once. It stays in $.state until the session accepts or refuses it.
    const marked = await $.state.set(
      request,
      { ...pending, isDispatched: true },
      { ifVersion: held.version },
    )
    if (!marked.isSet) {
      return answer
    }
    $.ui.status('Compacting at the checkpoint...')
    $.clock.after(DISPATCH_DELAY_MS, () => {
      void queueCompaction($, pending).catch(() => undefined)
    })

    return answer
  })
}

// Queues the person's own /compact, which the session runs once it is idle, and
// settles the request when the session has run it or refused it.
//
// $.session.compact() is not used: it rejects while a turn runs, and this runs
// right after one; in a headless or SDK session, such as the Claude desktop
// app's, it is not available at all ("compaction here runs inside a turn (a
// /compact prompt)").
async function queueCompaction($: EngineInterface, pending: CompactRequest) {
  let failure: string | undefined
  try {
    await $.command.run({ command: 'compact', args: pending.instructions ?? '' })
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }

  // Clear the request now, unless it is no longer this one: Claude may have asked
  // again while this one ran, and that newer request must still get its turn.
  const held = await $.state.get(request)
  if (held.value?.id === pending.id) {
    const cleared = await $.state.set(request, null, { ifVersion: held.version })
    if (cleared.isSet) {
      $.ui.status(undefined)
    }
  }
  if (failure !== undefined) {
    $.ui.toast(`Checkpoint compaction failed: ${failure}`, { timeoutMs: 8000 })
  }
}
