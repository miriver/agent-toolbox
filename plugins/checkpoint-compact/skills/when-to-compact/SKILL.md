---
name: when-to-compact
description: Decide whether compacting the conversation now saves more than it costs, and prepare a lean compaction. Use before calling compact_at_checkpoint, and when a long session reaches a natural checkpoint and you are weighing it.
---

# When to compact

Compaction is a trade, not housekeeping. Every request re-reads the whole
conversation, so a large conversation costs something on every request that
follows. Compacting costs one pass over the whole conversation to write the
summary, plus everything you read again afterwards to get back to work. It pays
only when the requests still to come, each carrying less, save more than that.

## Compact when all of these hold

1. **The conversation is large, and most of it is history.** Finished work, tool
   output already acted on, long file reads and logs the next step will not need.
   Where a tool reports the context's size, check it instead of guessing.
2. **The session has a long way to go:** many more requests, such as further
   units of work, or background work that will come back to be handled.
3. **The next step starts fresh.** A unit of work just finished, and what comes
   next needs a few pointers, not the details you just read or discussed.
4. **What matters is already in a record kept for its own sake:** a tracking
   issue, a PR, commits, the repository's files, notes the project already keeps.

A session about to wait longer than the prompt cache lasts is a good moment when
these hold: after the wait the whole conversation is read again uncached, and a
compacted one costs far less to read.

## Do not compact when

- The conversation is small, or the session is nearly over: the summary costs
  more than it saves.
- The next step leans on what you just read or discussed, such as fixing what a
  review just found or answering a question about it. Finish that first.
- A question to the human is open and its context lives only in this
  conversation.
- You are in the middle of a task.

## Do not pay twice

Continue from records you would keep anyway. Do not write long notes, dumps of
the conversation or copies of files just so you can compact: writing them costs
output, and reading them back afterwards costs what the compaction saved. Notes in
memory or instruction files are the costliest place, since every later session
loads them.

If getting ready would mean writing a lot down, the next step still depends on
this conversation: keep working and compact at a later checkpoint. Before you
compact, add to the record only what it lacks, usually a few lines: a decision
made in chat, the next step, the IDs of work in flight.

## Write lean instructions

`instructions` say where to continue from, not what happened: the issue, PR or
file to read first, the next step, the IDs of subagents or background tasks to
collect, and any rule from the human not yet written down. Give pointers, not
contents; the record holds the detail.

## After compacting

Continue from the summary and read only what the next step needs. Do not re-read
the whole record, every file you touched or a long log to be safe: that rebuilds
the context you just shed. If you find you must re-read most of it, the
checkpoint came too early; wait longer before the next one.
