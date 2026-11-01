import type { CommandRunInput, CommandRunResult, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const TOOL = 'mcp__session-controls__compact_at_checkpoint'

type Outcome = (e: CommandRunInput) => CommandRunResult | Promise<CommandRunResult>

const ran: Outcome = () => ({ text: 'Compacted' })

const END = { durationMs: 5, isAborted: false, reason: 'answer' } as const

// A request in the mod's slot: it carries the id of the tool call that made it.
const held = (fields: object) => ({ id: expect.any(String), ...fields })

// Long enough for the mod's timer to fire after a turn ends, short enough to
// stay below a command a test holds open.
const AFTER_THE_TURN_MS = 1_000

// Nothing sits beneath the plugin: each hook here stands for the engine.
function engine(on: On, outcome: Outcome = ran) {
  const clock = mock.clock(on)
  const registered: { name: string; description: string; isDeferred?: boolean }[] = []
  const commands: { command: string; args: string }[] = []
  // What the mod's pending-request slot held each time /compact was queued.
  const heldWhenQueued: unknown[] = []
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  // Every value the mod writes to its pending-request slot, in order.
  const writes: unknown[] = []

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.register', (_, e) => {
    registered.push(e)

    return { value: { tool: `mcp__session-controls__${e.name}` } }
  })
  on('command.run', (_, e) => {
    commands.push({ command: e.command, args: e.args })
    heldWhenQueued.push(writes.at(-1))

    return outcome(e)
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  // The kit holds $.state beneath the test's hooks: record the write, then pass it down.
  on('state.set', (_, e, next) => {
    writes.push(e.value)

    return next(e)
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.status', (_, e) => {
    statuses.push(e.text)

    return { value: undefined }
  })

  return {
    registered,
    commands,
    heldWhenQueued,
    toasts,
    statuses,
    writes,
    clock,
    // Lets the timer the mod set at the end of a turn fire, and what it started run.
    afterTheTurn: () => clock.advance(AFTER_THE_TURN_MS),
  }
}

test('the tool is registered with a description that names when to use it', async ($, on) => {
  const seen = engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(seen.registered).toHaveLength(1)
  const tool = seen.registered[0]
  expect(tool?.name).toBe('compact_at_checkpoint')
  // Visible from the first prompt, not behind ToolSearch.
  expect(tool?.isDeferred).toBe(false)
  expect(tool?.description).toContain('natural checkpoint')
  expect(tool?.description).toContain('written somewhere durable')
  expect(tool?.description).toContain('Never call it in the middle of a task')
})

test('calling the tool records a request and does not compact', async ($, on) => {
  const seen = engine(on)

  const called = await $.tool.call({ tool: TOOL, instructions: 'Keep issue 12 and the next step.' })
  await seen.afterTheTurn()

  expect(String(called.result)).toContain('when this turn ends')
  expect(seen.commands).toHaveLength(0)
  expect(seen.writes).toEqual([held({ instructions: 'Keep issue 12 and the next step.' })])
  expect(seen.statuses).toEqual(['Compaction queued for the end of this turn'])
})

test('at turn end /compact is queued once, after the turn, with the instructions', async ($, on) => {
  const seen = engine(on)

  await $.tool.call({ tool: TOOL, instructions: 'Keep issue 12 and the next step.' })
  await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })

  // Not from the hook the turn waits on: the command is refused there.
  expect(seen.commands).toHaveLength(0)

  await seen.afterTheTurn()

  expect(seen.commands).toEqual([{ command: 'compact', args: 'Keep issue 12 and the next step.' }])
  // The request stayed, marked as on its way, until the command was accepted.
  expect(seen.heldWhenQueued).toEqual([
    held({ instructions: 'Keep issue 12 and the next step.', isDispatched: true }),
  ])
  expect(seen.writes.at(-1)).toBeNull()
  expect(seen.statuses.slice(-2)).toEqual(['Compacting at the checkpoint...', undefined])
  expect(seen.toasts).toEqual([])

  // The next turn finds nothing pending.
  await $.turn.complete({ answer: 'Next.', turnId: 't2', ...END })
  await seen.afterTheTurn()
  expect(seen.commands).toHaveLength(1)
})

test('a call without instructions, or with blank ones, compacts with none', async ($, on) => {
  const seen = engine(on)

  await $.tool.call({ tool: TOOL })
  await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })
  await seen.afterTheTurn()
  await $.tool.call({ tool: TOOL, instructions: '   ' })
  await $.turn.complete({ answer: 'Done.', turnId: 't2', ...END })
  await seen.afterTheTurn()

  expect(seen.commands).toEqual([
    { command: 'compact', args: '' },
    { command: 'compact', args: '' },
  ])
})

test('a second call in the same turn replaces the first and still compacts once', async ($, on) => {
  const seen = engine(on)

  await $.tool.call({ tool: TOOL, instructions: 'first' })
  await $.tool.call({ tool: TOOL, instructions: 'second' })
  await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })
  await seen.afterTheTurn()

  expect(seen.commands).toEqual([{ command: 'compact', args: 'second' }])
})

test('no request, no compaction', async ($, on) => {
  const seen = engine(on)

  await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })
  await seen.afterTheTurn()

  expect(seen.commands).toHaveLength(0)
  expect(seen.toasts).toEqual([])
  expect(seen.statuses).toEqual([])
})

test('a command the session refuses is reported, nothing breaks and the request is cleared', async ($, on) => {
  const seen = engine(on, () => {
    throw new Error('no command named /compact in this session')
  })

  await $.tool.call({ tool: TOOL, instructions: 'x' })
  const ended = await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })
  await seen.afterTheTurn()

  expect(ended.text).toBe('Done.')
  expect(seen.commands).toHaveLength(1)
  // Kept while the command was being refused, cleared once it was.
  expect(seen.heldWhenQueued).toEqual([held({ instructions: 'x', isDispatched: true })])
  expect(seen.writes.at(-1)).toBeNull()
  expect(seen.toasts).toHaveLength(1)
  expect(seen.toasts[0]).toContain('Checkpoint compaction failed')
  expect(seen.statuses.at(-1)).toBeUndefined()

  await $.turn.complete({ answer: 'Next.', turnId: 't2', ...END })
  await seen.afterTheTurn()
  expect(seen.commands).toHaveLength(1)
})

test('a command that takes a while keeps the request until it finishes, and is queued once', async ($, on) => {
  let seen!: ReturnType<typeof engine>
  seen = engine(on, async () => {
    await seen.clock.sleep(5_000)

    return { text: 'Compacted' }
  })

  await $.tool.call({ tool: TOOL, instructions: 'x' })
  await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })
  await seen.afterTheTurn()

  // Queued, still running: the request is held, marked as on its way.
  expect(seen.commands).toHaveLength(1)
  expect(seen.writes.at(-1)).toEqual(held({ instructions: 'x', isDispatched: true }))
  expect(seen.statuses.at(-1)).toBe('Compacting at the checkpoint...')

  // Another turn ending meanwhile does not queue it again.
  await $.turn.complete({ answer: 'Meanwhile.', turnId: 't2', ...END })
  await seen.afterTheTurn()
  expect(seen.commands).toHaveLength(1)
  expect(seen.writes.at(-1)).toEqual(held({ instructions: 'x', isDispatched: true }))

  await seen.clock.advance(5_000)

  expect(seen.writes.at(-1)).toBeNull()
  expect(seen.statuses.at(-1)).toBeUndefined()
  expect(seen.toasts).toEqual([])
  expect(seen.commands).toHaveLength(1)
})

test('a request made while a compaction runs survives its end', async ($, on) => {
  let seen!: ReturnType<typeof engine>
  seen = engine(on, async () => {
    await seen.clock.sleep(5_000)

    return { text: 'Compacted' }
  })

  await $.tool.call({ tool: TOOL, instructions: 'first' })
  await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })
  await seen.afterTheTurn()
  await $.tool.call({ tool: TOOL, instructions: 'second' })

  await seen.clock.advance(5_000)

  expect(seen.writes.at(-1)).toEqual(held({ instructions: 'second' }))
  expect(seen.statuses.at(-1)).toBe('Compaction queued for the end of this turn')

  await $.turn.complete({ answer: 'Done.', turnId: 't2', ...END })
  await seen.afterTheTurn()
  expect(seen.commands.map(c => c.args)).toEqual(['first', 'second'])
})

test('a compaction that finishes does not clear a newer request already on its way', async ($, on) => {
  let seen!: ReturnType<typeof engine>
  seen = engine(on, async () => {
    await seen.clock.sleep(5_000)

    return { text: 'Compacted' }
  })

  // A: queued at 500 ms after its turn, and running until 5,500 ms.
  await $.tool.call({ tool: TOOL, instructions: 'A' })
  await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })
  await seen.clock.advance(500)
  expect(seen.commands.map(c => c.args)).toEqual(['A'])

  // B asks and its turn ends while A still runs; B's timer is due at 5,900 ms.
  await seen.clock.advance(4_900)
  await $.tool.call({ tool: TOOL, instructions: 'B' })
  await $.turn.complete({ answer: 'Done.', turnId: 't2', ...END })

  // A finishes at 5,500 ms, before B's timer fires, and must leave B alone.
  await seen.clock.advance(100)
  expect(seen.commands.map(c => c.args)).toEqual(['A'])
  expect(seen.writes.at(-1)).toEqual(held({ instructions: 'B', isDispatched: true }))
  expect(seen.statuses.at(-1)).toBe('Compacting at the checkpoint...')

  // B's timer then queues it, and B's own end clears it.
  await seen.clock.advance(400)
  expect(seen.commands.map(c => c.args)).toEqual(['A', 'B'])
  await seen.clock.advance(5_000)
  expect(seen.writes.at(-1)).toBeNull()
  expect(seen.statuses.at(-1)).toBeUndefined()
  expect(seen.toasts).toEqual([])
})

test('a turn that ended without an answer drops the request and does not compact', async ($, on) => {
  const seen = engine(on)

  await $.tool.call({ tool: TOOL, instructions: 'x' })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: 't1', reason: 'aborted' })
  await seen.afterTheTurn()

  expect(seen.commands).toHaveLength(0)
  expect(seen.toasts).toHaveLength(1)
  expect(seen.toasts[0]).toContain('cancelled')
  expect(seen.statuses.at(-1)).toBeUndefined()
  expect(seen.writes.at(-1)).toBeNull()

  await $.turn.complete({ answer: 'Next.', turnId: 't2', ...END })
  await seen.afterTheTurn()
  expect(seen.commands).toHaveLength(0)
})

test('a request left by an earlier load is dropped at session start', async ($, on) => {
  const seen = engine(on)

  await $.tool.call({ tool: TOOL, instructions: 'x' })
  await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })
  // The reload that follows runs session.start again and drops the timer.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(seen.writes.at(-1)).toBeNull()

  await $.turn.complete({ answer: 'Next.', turnId: 't2', ...END })
  expect(seen.commands).toHaveLength(0)
})

test('a subagent cannot request, and its turn end leaves the main loop\'s request alone', async ($, on) => {
  const seen = engine(on)

  const refused = await $.tool.call({ tool: TOOL, instructions: 'x', agentId: 'agent-1' })
  expect(refused.deny).toContain('subagent')
  expect(seen.writes).toEqual([])

  await $.tool.call({ tool: TOOL, instructions: 'main' })
  await $.turn.complete({ answer: 'Sub.', turnId: 'ta', agentId: 'agent-1', ...END })
  await seen.afterTheTurn()
  expect(seen.commands).toHaveLength(0)

  await $.turn.complete({ answer: 'Done.', turnId: 't1', ...END })
  await seen.afterTheTurn()
  expect(seen.commands).toEqual([{ command: 'compact', args: 'main' }])
})
