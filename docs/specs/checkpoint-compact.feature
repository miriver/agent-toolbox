Feature: Checkpoint compaction
  The checkpoint-compact mod lets Claude compact its own conversation at a
  checkpoint it chooses, so a long Claude Code session stops paying to re-read a
  conversation whose useful state is already written somewhere durable.

  Rule: Act only where the human installed the mod

    Scenario: Change nothing until the mod is installed
      Given the agent-toolbox marketplace is added
      And the human has not installed checkpoint-compact
      Then no session has the compaction tool

    Scenario: Install it for every session
      When the human installs checkpoint-compact at user scope
      Then sessions in every project have the compaction tool

    Scenario: Install it for one project
      When the human installs checkpoint-compact at local scope in a project
      Then sessions in that project have the compaction tool
      And sessions in other projects do not

  Rule: Tell Claude when to compact

    Scenario: Name the checkpoint in the tool's description
      Given a session has the compaction tool
      Then its description tells Claude to use it at a natural checkpoint
      And only after everything that matters is written somewhere durable
      And never in the middle of a task
      And it names no project, so it reads the same in any project

    Scenario: Teach when compaction pays
      Given a session has the compaction tool
      Then a skill tells Claude to compact only when the conversation is large,
        much work remains, the next step needs little of it, and what matters is
        already in a record kept for its own sake
      And tells Claude not to write long notes just so it can compact
      And tells Claude to read only what the next step needs after compacting
      And the tool's description says the same in brief and names the skill

    Scenario: Show the tool from the first prompt
      Given a session has the compaction tool
      Then Claude sees the tool without searching for it

  Rule: Compact when the turn ends, not during it

    Scenario: Record the request without compacting
      When Claude calls the tool, optionally with instructions for the summary
      Then the mod records the request
      And tells Claude the compaction runs when the turn ends
      And does not compact during the turn

    Scenario: Compact once when the turn ends
      Given Claude requested a compaction during the turn
      When the turn ends with an answer
      Then the mod queues one compaction with the instructions
      And does so after the turn has settled, not from inside the turn's end
      And the session compacts once it is idle

    Scenario: Keep the request until the session accepts the compaction
      Given the mod queued a compaction that has not finished
      Then the request stays, marked as on its way
      And another turn ending does not queue a second compaction
      When the session has run or refused the compaction
      Then the mod clears the request

    Scenario: Keep a newer request when an earlier compaction finishes
      Given the mod queued a compaction that has not finished
      And Claude requested another compaction meanwhile
      When the first compaction finishes
      Then the mod keeps the newer request for the end of its turn

    Scenario: Keep the latest request when Claude asks twice in a turn
      Given Claude requested a compaction twice during the turn
      When the turn ends with an answer
      Then the mod queues one compaction with the second request's instructions

    Scenario: Compact nothing without a request
      Given Claude requested no compaction
      When a turn ends
      Then the mod compacts nothing and shows nothing

    Scenario: Leave an interrupted or failed turn alone
      Given Claude requested a compaction during the turn
      When the turn ends without an answer
      Then the mod clears the request
      And does not compact
      And tells the human the compaction was cancelled

  Rule: Compact only the main conversation

    Scenario: Refuse a subagent's request
      When a subagent calls the tool
      Then the mod refuses the call and records no request

    Scenario: Ignore a subagent's turn end
      Given Claude requested a compaction during the turn
      When a subagent's turn ends
      Then the mod leaves the request for the main turn's end

  Rule: Report a compaction that cannot be queued

    Scenario: Report the failure and carry on
      Given the session refuses to queue the compaction
      When the turn ends
      Then the mod tells the human the compaction failed
      And clears the request
      And the session carries on with its conversation unchanged
