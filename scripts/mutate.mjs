/**
 * Mutation arms: inject one defect into the built output at a time and require
 * the suite to fail. A mutant that survives is either a hole in the tests or an
 * equivalent mutant, which is named here rather than run.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url)

const MUTANTS = [
  {
    name: 'treat a cause line as a row of its own',
    file: 'lib/diagnose.js',
    from: "if (/^\\s*-\\s/u.test(text))",
    to: 'if (false)',
  },
  {
    name: 'call every duplicate scoped',
    file: 'lib/diagnose.js',
    from: "kind = GLOBAL_HINT.test(message) || !SCOPED_HINT.test(message) ? 'global-layer-duplicate' : 'scoped-duplicate';",
    to: "kind = 'scoped-duplicate';",
  },
  {
    name: 'call every duplicate global',
    file: 'lib/diagnose.js',
    from: "kind = GLOBAL_HINT.test(message) || !SCOPED_HINT.test(message) ? 'global-layer-duplicate' : 'scoped-duplicate';",
    to: "kind = 'global-layer-duplicate';",
  },
  {
    name: 'never report a module as shared with the deployment plane',
    file: 'lib/diagnose.js',
    from: "hostPlaneShared: kind === 'global-layer-duplicate'",
    to: "hostPlaneShared: false && kind === 'global-layer-duplicate'",
  },
  {
    name: 'report every duplicate module as shared',
    file: 'lib/diagnose.js',
    from: "&& moduleName !== null\n                && hostModules.has(moduleName),",
    to: '&& moduleName !== null,',
  },
  {
    name: 'never inherit the row above',
    file: 'lib/diagnose.js',
    from: 'const entryId = row?.groups?.[\'entry\'] ?? last.entryId;',
    to: "const entryId = row?.groups?.['entry'] ?? null;",
  },
  {
    name: 'count one claim once per row instead of once per name',
    file: 'lib/diagnose.js',
    from: 'const claims = new Set();',
    to: 'const claims = [];',
  },
  {
    name: 'treat a structural group row as a module',
    file: 'lib/index.js',
    from: "if (entry.options?.group === true)\n            continue;",
    to: 'if (false)\n            continue;',
  },
  {
    name: 'log even when told not to',
    file: 'lib/index.js',
    from: 'if (log && report.presets.length > 0) {',
    to: 'if (report.presets.length > 0) {',
  },
  {
    name: 'schedule a reading even when eager is off',
    file: 'lib/index.js',
    from: 'if (!config.eager)\n        return;',
    to: 'if (false)\n        return;',
  },
  {
    name: 'accept a negative delay',
    file: 'lib/index.js',
    from: '|| row.delayMs < 0',
    to: '',
  },
]

/** Mutants that no test can distinguish, with the reason, kept visible rather than dropped. */
const EQUIVALENT = [
  {
    name: 'drop the empty-string check on `broken`',
    why: 'an empty `broken` splits into one blank line, which classifies to nothing, so no preset row is emitted either way',
  },
  {
    name: 'unanchor the row pattern',
    why: 'every caller already trims the line, so an anchored and an unanchored pattern read the same input identically',
  },
]

function runSuite() {
  const result = spawnSync(process.execPath, ['--test', 'test/diagnose.spec.mjs'], { cwd: ROOT, encoding: 'utf8' })
  return result.status === 0
}

let caught = 0
let survivor = 0
const clean = runSuite()
if (!clean) {
  console.error('the unmutated suite fails; mutation arms are meaningless until it passes')
  process.exit(1)
}

for (const mutant of MUTANTS) {
  const path = new URL(mutant.file, ROOT)
  const original = readFileSync(path, 'utf8')
  if (!original.includes(mutant.from)) {
    console.log(`MISSING  ${mutant.name} — pattern not found in ${mutant.file}`)
    survivor++
    continue
  }
  writeFileSync(path, original.replace(mutant.from, mutant.to))
  let passed
  try {
    passed = runSuite()
  } finally {
    writeFileSync(path, original)
  }
  if (passed) {
    console.log(`SILENT   ${mutant.name}`)
    survivor++
  } else {
    console.log(`CAUGHT   ${mutant.name}`)
    caught++
  }
}

for (const equivalent of EQUIVALENT) console.log(`EQUIVALENT ${equivalent.name} — ${equivalent.why}`)
console.log(`\n${caught}/${MUTANTS.length} caught, ${survivor} silent, ${EQUIVALENT.length} named equivalent`)
if (survivor > 0) process.exit(1)
