/**
 * Mount the built plugin on a real Cordis Context with stand-in roster
 * services, so `get()`, `effect()` and the deferred reading are exercised
 * against the runtime rather than against a hand-written fake.
 */
import { Context } from '@deepseek-ai/cordis'
import { apply, inspect } from '../lib/index.js'

const MODULE = '@deepseek-ai/dsh-persona'
const LINE = 'persona (@deepseek-ai/dsh-persona): prompt section "deployment:persona-prefix" is already registered (for a per-agent override, register through that agent\'s `agent.ctx` instead)'

const ctx = new Context()
ctx.provide('agentPresets')
ctx.set('agentPresets', { list: async () => [{ id: 'cordis', broken: LINE }, { id: 'standard' }] })
ctx.provide('loader')
ctx.set('loader', { root: { tree: { entries: () => [{ options: { name: MODULE } }, { options: { group: true, name: 'grp' } }] } } })

const report = await inspect({ ctx, log: false })
const [preset] = report.presets
if (preset?.presetId !== 'cordis' || preset.findings.length !== 1) throw new Error(`unexpected report: ${JSON.stringify(report)}`)
if (preset.findings[0].hostPlaneShared !== true) throw new Error('the shared-module flag did not survive the real service read')
if (preset.findings[0].entryId !== 'persona') throw new Error('the entry was not read back')
console.log('inspect on a real Context:', preset.findings[0].kind, '→', preset.findings[0].duplicateName)

const before = Date.now()
apply(ctx, { eager: true, delayMs: 5, log: false })
await new Promise(resolve => setTimeout(resolve, 30))
if (Date.now() - before < 5) throw new Error('the deferred reading did not wait for its delay')
console.log('apply scheduled and ran on a real fiber without throwing')

apply(ctx, { eager: false, delayMs: 0, log: false })
await ctx.fiber.dispose()
console.log('MOUNT SMOKE OK')
