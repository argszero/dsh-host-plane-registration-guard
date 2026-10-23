# @argszero/dsh-host-plane-registration-guard

Names the rows of a failed agent-preset mount, and the plane each rejected
registration hit.

## The wall this reads

A preset that cannot mount reports **one** error carrying **many** lines. The
registry stores `auditRows(tree).failed.join('\n')` and later throws it as a single
`RemoteError('agent-preset/invalid')`, so what a reader sees is:

```
RemoteError: persona (@deepseek-ai/dsh-persona): prompt section "deployment:persona-prefix" is already registered (for a per-agent override, register through that agent's `agent.ctx` instead)
tool "todo_write" is already registered (for a per-agent variant, register through that agent's `agent.ctx` instead)
tool-subagent (@deepseek-ai/dsh-tool-subagent): tool-subagent: standing `modelSelectionSettings` requires a scoped preset Context
```

Each line is one row of the preset's own Loader tree, in the form
`<entryId> (<module>): <that row's own failure>`. Some lines carry no row prefix at
all: a row that rejects with several causes renders them beneath the first
(`- member message`), and they are detail of the row above, not further rows.

## What the text already tells you

The core factories branch on the scope the registration was made from
(`dsh-system-prompt/src/index.ts:406-415`, `dsh-tools/src/index.ts:748`):

| the message ends with | the rejection hit |
|---|---|
| `(for a per-agent override, register through that agent's \`agent.ctx\` instead)` | the **deployment (global)** layer |
| `in this scope` | a **scoped** layer |

A dialog that shows this wall and asks "which one is the duplicate?" can be
answered from the text alone: the per-agent hint means the row registered where the
deployment already owns the name.

## What this plugin adds

The text does not say whether the failing module is **also mounted at the
deployment plane** — the fact that decides the fix, because a module listed in both
a profile bundle and a preset's plugin list is one plugin declared twice. The
plugin reads the two public rosters, `agentPresets.list()` and the Loader's entry
tree, and reports one line per failing row:

```
preset cordis: persona (@deepseek-ai/dsh-persona) → section "deployment:persona-prefix" — this module is also mounted at the deployment plane; keep it in one of the two lists
```

Four causes are distinguished:

| cause | meaning | who can fix it |
|---|---|---|
| `global-layer-duplicate` + shared module | the same module is a bundle and a preset row | the composition owner: keep it in one list |
| `global-layer-duplicate`, module not on the deployment plane | the row registered on the deployment plane instead of its own scope | a scope-ownership question in the code that registered it |
| `scoped-duplicate` | two rows of one preset claim the same name | the preset's own plugin list |
| `scope-required` | a row refuses to run without a scoped preset context | the row's plugin, or the mount that failed to give it one |

## What it does not do

It does not repair anything. It never edits a composition, never disables a row,
never suppresses a failure, and never writes a session. The layer a registration
lands on is decided by the context the plugin registers from — a fact no second
plugin can rewrite on behalf of a third.

## Install

```yaml
# cordis.patch.yml
- insert:
    - id: host-plane-registration-guard
      name: '@argszero/dsh-host-plane-registration-guard'
```

Or mount it as a bundle: the package declares `dsh.bundle.patch`, so
`dsh plugin --profile <profile> add github:argszero/dsh-host-plane-registration-guard`
writes the one `dsh.profile.bundles` entry it needs. The package is installed
from its repository, not from npm.

Optional configuration:

```yaml
- set:
    - id: host-plane-registration-guard
      config:
        eager: true     # take one reading on activation (default)
        delayMs: 0      # wait this long first, for a Host tree still settling
        log: true       # log the reading once (default)
```

## Use from code

```ts
import { inspect, diagnose } from '@argszero/dsh-host-plane-registration-guard'

const report = await inspect({ ctx })          // reads the live rosters
const offline = diagnose(presets, hostModules) // pure: same input, same verdict
```

`diagnose` is pure, so one reading can be compared against another before and
after a composition edit.

## Requirements

Zero runtime dependencies. Node `^22.19 || >=24`; peer `@deepseek-ai/cordis ^4.0.2`.

## Licence

MIT.
