import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diagnose, formatFinding } from '../lib/diagnose.js'
import { Config, hostPlaneModules, inspect, apply } from '../lib/index.js'

const PERSONA_MODULE = '@deepseek-ai/dsh-persona'
const PERSONA_LINE = 'persona (@deepseek-ai/dsh-persona): prompt section "deployment:persona-prefix" is already registered (for a per-agent override, register through that agent\'s `agent.ctx` instead)'

test('a global-layer rejection is named with its entry, module and registry name', () => {
  const report = diagnose([{ id: 'cordis', broken: PERSONA_LINE }], [PERSONA_MODULE])
  assert.equal(report.presets.length, 1)
  const [finding] = report.presets[0].findings
  assert.equal(finding.entryId, 'persona')
  assert.equal(finding.moduleName, PERSONA_MODULE)
  assert.equal(finding.kind, 'global-layer-duplicate')
  assert.equal(finding.registry, 'section')
  assert.equal(finding.duplicateName, 'deployment:persona-prefix')
  assert.equal(finding.hostPlaneShared, true)
  assert.deepEqual(report.collisions, ['cordis: section "deployment:persona-prefix"'])
})

test('a global-layer rejection whose module is not mounted at the deployment plane is not called shared', () => {
  const [finding] = diagnose([{ id: 'cordis', broken: PERSONA_LINE }], []).presets[0].findings
  assert.equal(finding.kind, 'global-layer-duplicate')
  assert.equal(finding.hostPlaneShared, false)
})

test('the scoped wording is a different cause from the global one', () => {
  const line = 'alpha (pkg-a): tool "bash" is already registered in this scope'
  const [finding] = diagnose([{ id: 'p', broken: line }], []).presets[0].findings
  assert.equal(finding.kind, 'scoped-duplicate')
  assert.equal(finding.registry, 'tool')
  assert.equal(finding.duplicateName, 'bash')
  assert.equal(finding.hostPlaneShared, false)
})

test('a line carrying no row prefix inherits the row above it', () => {
  const broken = `${PERSONA_LINE}\ntool "todo_write" is already registered (for a per-agent variant, register through that agent\'s \`agent.ctx\` instead)`
  const findings = diagnose([{ id: 'cordis', broken }], [PERSONA_MODULE]).presets[0].findings
  assert.equal(findings.length, 2)
  const row = findings[1]
  assert.equal(row.registry, 'tool')
  assert.equal(row.duplicateName, 'todo_write')
  assert.equal(row.kind, 'global-layer-duplicate')
  assert.equal(row.entryId, 'persona')
})

test('a row that demands a scoped preset context is classified as such, not as a duplicate', () => {
  const line = 'tool-subagent (@deepseek-ai/dsh-tool-subagent): tool-subagent: standing `modelSelectionSettings` requires a scoped preset Context'
  const [finding] = diagnose([{ id: 'cordis', broken: line }], []).presets[0].findings
  assert.equal(finding.kind, 'scope-required')
  assert.equal(finding.duplicateName, null)
  assert.equal(finding.registry, null)
})

test('cause lines rendered beneath a row are detail, never findings of their own', () => {
  const broken = `aggregate (pkg-a): three things failed\n- first member\n- wrapped member\n  - nested member`
  const findings = diagnose([{ id: 'p', broken }], []).presets[0].findings
  assert.equal(findings.length, 1)
  assert.equal(findings[0].kind, 'other')
  assert.equal(findings[0].message, 'three things failed')
})

test('an unrecognized failure is still reported verbatim', () => {
  const [finding] = diagnose([{ id: 'p', broken: 'weird (pkg-w): something nobody expected' }], []).presets[0].findings
  assert.equal(finding.kind, 'other')
  assert.equal(finding.entryId, 'weird')
  assert.equal(finding.message, 'something nobody expected')
})

test('presets that mounted cleanly are absent from the report', () => {
  const report = diagnose([{ id: 'ok' }, { id: 'blank', broken: '' }, { id: 'bad', broken: PERSONA_LINE }], [])
  assert.deepEqual(report.presets.map(row => row.presetId), ['bad'])
})

test('one claim made twice is counted once, while both rows stay visible', () => {
  const broken = `${PERSONA_LINE}\npersona (@deepseek-ai/dsh-persona): prompt section "deployment:persona-prefix" is already registered in this scope`
  const report = diagnose([{ id: 'p', broken }], [])
  assert.equal(report.presets[0].findings.length, 2)
  assert.equal(report.collisions.length, 1)
})

test('blank lines and whitespace change nothing', () => {
  const report = diagnose([{ id: 'p', broken: `\n  \n${PERSONA_LINE}\n\n` }], [])
  assert.equal(report.presets[0].findings.length, 1)
})

test('a whitespace-led row is still read as a row', () => {
  const [finding] = diagnose([{ id: 'p', broken: `   ${PERSONA_LINE}` }], []).presets[0].findings
  assert.equal(finding.entryId, 'persona')
})

test('the host plane reads modules, skips structural group rows, dedupes and sorts', () => {
  const tree = {
    entries: () => [
      { options: { name: 'zeta' } },
      { options: { name: 'alpha' } },
      { options: { group: true, name: 'group-row' } },
      { options: {} },
      { options: { name: 'alpha' } },
      {},
    ],
  }
  assert.deepEqual(hostPlaneModules({ root: { tree } }), ['alpha', 'zeta'])
  assert.deepEqual(hostPlaneModules(tree), ['alpha', 'zeta'])
  assert.deepEqual(hostPlaneModules(undefined), [])
  assert.deepEqual(hostPlaneModules({ root: {} }), [])
  assert.deepEqual(hostPlaneModules({ entries: () => [] }), [])
})

test('inspect reads both rosters and reports the empty case without inventing a preset', async () => {
  const warned = []
  const ctx = {
    get: (name) => name === 'agentPresets' ? undefined : { entries: () => [] },
    logger: { warn: (...args) => warned.push(args) },
  }
  const report = await inspect({ ctx })
  assert.deepEqual(report.presets, [])
  assert.deepEqual(report.hostModules, [])
  assert.equal(warned.length, 0)
})

test('inspect tolerates a roster that is not an array', async () => {
  const ctx = { get: (name) => name === 'agentPresets' ? { list: async () => null } : undefined }
  const report = await inspect({ ctx, log: false })
  assert.deepEqual(report.presets, [])
})

test('inspect logs one finding per row and names the double claims', async () => {
  const warned = []
  const ctx = {
    get: (name) => name === 'agentPresets'
      ? { list: async () => [{ id: 'cordis', broken: PERSONA_LINE }] }
      : { entries: () => [{ options: { name: PERSONA_MODULE } }] },
    logger: { warn: (...args) => warned.push(args) },
  }
  const report = await inspect({ ctx })
  assert.equal(warned.length, 2)
  assert.match(String(warned[0][1]), /preset cordis: persona \(@deepseek-ai\/dsh-persona\)/)
  assert.match(String(warned[1][1]), /deployment:persona-prefix/)
  assert.equal(report.presets.length, 1)
})

test('inspect stays silent when asked to, and when nothing failed', async () => {
  const warned = []
  const broken = {
    get: () => ({ list: async () => [{ id: 'p', broken: PERSONA_LINE }] }),
    logger: { warn: (...args) => warned.push(args) },
  }
  await inspect({ ctx: broken, log: false })
  const clean = {
    get: () => ({ list: async () => [{ id: 'p' }] }),
    logger: { warn: (...args) => warned.push(args) },
  }
  await inspect({ ctx: clean })
  assert.equal(warned.length, 0)
})

test('every finding formats with the action its cause implies', () => {
  const hostShared = formatFinding({
    presetId: 'cordis',
    entryId: 'persona',
    moduleName: PERSONA_MODULE,
    kind: 'global-layer-duplicate',
    duplicateName: 'deployment:persona-prefix',
    registry: 'section',
    hostPlaneShared: true,
    message: 'x',
  })
  assert.equal(hostShared, 'preset cordis: persona (@deepseek-ai/dsh-persona) → section "deployment:persona-prefix" — this module is also mounted at the deployment plane; keep it in one of the two lists')

  const globalOnly = formatFinding({
    presetId: 'p',
    entryId: 'a',
    moduleName: 'm',
    kind: 'global-layer-duplicate',
    duplicateName: 'n',
    registry: 'tool',
    hostPlaneShared: false,
    message: 'x',
  })
  assert.match(globalOnly, /registered on the deployment plane instead of its own scope$/u)

  const scoped = formatFinding({
    presetId: 'p', entryId: 'a', moduleName: 'm', kind: 'scoped-duplicate',
    duplicateName: 'n', registry: 'tool', hostPlaneShared: false, message: 'x',
  })
  assert.match(scoped, /two rows of this preset declare the same name$/u)

  const scopeRequired = formatFinding({
    presetId: 'p', entryId: 'a', moduleName: 'm', kind: 'scope-required',
    duplicateName: null, registry: null, hostPlaneShared: false, message: 'needs scope',
  })
  assert.match(scopeRequired, /did not receive a scoped preset context$/u)

  const other = formatFinding({
    presetId: 'p', entryId: null, moduleName: null, kind: 'other',
    duplicateName: null, registry: null, hostPlaneShared: false, message: 'boom',
  })
  assert.equal(other, 'preset p: preset row → boom')
})

test('configuration validates, defaults and refuses unusable values', () => {
  assert.deepEqual(Config['~standard'].validate(undefined), { value: { eager: true, delayMs: 0, log: true } })
  assert.deepEqual(Config['~standard'].validate({ eager: false }), { value: { eager: false, delayMs: 0, log: true } })
  assert.ok('issues' in Config['~standard'].validate({ eager: 'yes' }))
  assert.ok('issues' in Config['~standard'].validate({ delayMs: -1 }))
  assert.ok('issues' in Config['~standard'].validate({ delayMs: Infinity }))
  assert.ok('issues' in Config['~standard'].validate({ log: 1 }))
})

test('apply takes no reading when configured off, and its timer never keeps the process alive', () => {
  let effected = 0
  const ctx = { get: () => undefined, effect: () => { effected++; return () => {} } }
  apply(ctx, { eager: false, delayMs: 0, log: true })
  assert.equal(effected, 0)
  apply(ctx, { eager: true, delayMs: 1000, log: false })
  assert.equal(effected, 1)
})
