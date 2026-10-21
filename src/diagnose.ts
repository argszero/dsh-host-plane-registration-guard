/**
 * Classify one preset's mount diagnostic into a named cause per registration.
 *
 * A preset mount that fails reports every unusable row as one line of a single
 * `broken` string (`<entryId> (<module>): <error text>`, joined with newlines).
 * The error text itself already distinguishes the layer the rejected
 * registration hit — the core factories branch on `scope === undefined` and
 * print a per-agent hint only for the global layer — so the layer is readable
 * without re-running the mount.
 * @module dsh-host-plane-registration-guard/diagnose
 */

/** Which layer a rejected registration landed on. */
export type FindingKind =
  /** The registration hit the deployment (global) plane instead of the row's scope. */
  | 'global-layer-duplicate'
  /** Two rows of the same preset scope declare the same name. */
  | 'scoped-duplicate'
  /** A row demands a scoped preset context and received none. */
  | 'scope-required'
  /** A failure this plugin cannot classify; reported verbatim so it is not lost. */
  | 'other'

/** One registry name two owners both claim. */
export interface Finding {
  /** Preset whose mount reported the failure. */
  readonly presetId: string
  /** Entry id of the failing row, or null when the line carries none. */
  readonly entryId: string | null
  /** Module specifier of the failing row, or null when the line carries none. */
  readonly moduleName: string | null
  /** The layer the rejected registration hit. */
  readonly kind: FindingKind
  /** The duplicated registry name (section, context, variable or tool), when named. */
  readonly duplicateName: string | null
  /** The registry that owns the name (`section`, `context`, `variable`, `tool`). */
  readonly registry: string | null
  /** Whether the same module is also mounted at the deployment plane. */
  readonly hostPlaneShared: boolean
  /** The reported text, verbatim, for a reader who needs what the core said. */
  readonly message: string
}

/** One preset's verdict. */
export interface PresetDiagnosis {
  readonly presetId: string
  readonly findings: readonly Finding[]
}

/** The whole report. */
export interface Diagnosis {
  readonly presets: readonly PresetDiagnosis[]
  /** Module specifiers mounted at the deployment plane, as the loader sees them. */
  readonly hostModules: readonly string[]
  /** Distinct `(preset, registry, name)` claims, for a one-line summary. */
  readonly collisions: readonly string[]
}

/** A row line: `entry-id (module-specifier): message`; every part is optional in practice. */
const ROW_LINE = /^(?<entry>[^\s()]+)\s+\((?<module>[^()]+)\):\s*(?<message>.*)$/u

/** A duplicate-registration message, whichever layer produced it. */
const DUPLICATE = /^(?<registry>prompt section|prompt context|prompt variable|tool)\s+"(?<name>[^"]+)" is already registered(?<tail>.*)$/u

/** The hint the global layer appends, and the scoped layer never does. */
const GLOBAL_HINT = /\(for a per-(?:agent|agent's value)/u

/** The scoped layer's own wording. */
const SCOPED_HINT = /already registered in this scope/u

/** {@link classifyLine} result: a finding plus whether the line opened a new row. */
interface LineReading {
  readonly finding: Finding
  /** Whether this line starts a row (as opposed to continuing one). */
  readonly startsRow: boolean
}

/**
 * Read one line of a `broken` diagnostic.
 * @param line - one line, already split.
 * @param presetId - preset the diagnostic belongs to.
 * @param hostModules - deployment-plane module specifiers.
 * @param last - entry id of the row this line may continue, if any.
 * @returns the reading, or undefined for a line that carries no finding.
 */
function classifyLine(
  line: string,
  presetId: string,
  hostModules: ReadonlySet<string>,
  last: { entryId: string | null, moduleName: string | null },
): LineReading | undefined {
  const text = line.trimEnd()
  if (text.trim() === '') return undefined
  // A cause rendered beneath its row (`- member message`) is detail of the row
  // above, never an independent registration of its own.
  if (/^\s*-\s/u.test(text)) return undefined

  const row = ROW_LINE.exec(text.trimStart())
  const entryId = row?.groups?.['entry'] ?? last.entryId
  const moduleName = row?.groups?.['module'] ?? null
  const message = (row?.groups?.['message'] ?? text).trim()
  const startsRow = row !== null

  const duplicate = DUPLICATE.exec(message)
  let kind: FindingKind
  if (duplicate !== null) {
    // The factories differ only here: a global-layer rejection asks the caller
    // to re-register through a per-agent context, a scoped one does not.
    kind = GLOBAL_HINT.test(message) || !SCOPED_HINT.test(message) ? 'global-layer-duplicate' : 'scoped-duplicate'
  } else if (/requires a scoped (?:preset )?[Cc]ontext/u.test(message)) {
    kind = 'scope-required'
  } else {
    kind = 'other'
  }

  return {
    startsRow,
    finding: {
      presetId,
      entryId,
      moduleName,
      kind,
      duplicateName: duplicate?.groups?.['name'] ?? null,
      registry: duplicate?.groups?.['registry'] === undefined
        ? null
        : duplicate.groups['registry'].replace(/^prompt /u, ''),
      hostPlaneShared: kind === 'global-layer-duplicate'
        && moduleName !== null
        && hostModules.has(moduleName),
      message,
    },
  }
}

/**
 * Classify every preset's mount diagnostic.
 *
 * Pure: it reads the arguments and touches nothing else, so the same reading
 * can be taken before and after a composition edit and compared.
 * @param presets - `{ id, broken? }` rows, as `agentPresets.list()` returns them.
 * @param hostModules - module specifiers mounted at the deployment plane.
 * @returns one entry per preset that reported a failure, plus the host reading.
 */
export function diagnose(
  presets: readonly { readonly id: string, readonly broken?: string }[],
  hostModules: readonly string[],
): Diagnosis {
  const host = new Set(hostModules)
  const rows: PresetDiagnosis[] = []
  const claims = new Set<string>()

  for (const preset of presets) {
    if (preset.broken === undefined || preset.broken === '') continue
    const findings: Finding[] = []
    const last: { entryId: string | null, moduleName: string | null } = { entryId: null, moduleName: null }
    for (const line of preset.broken.split('\n')) {
      const reading = classifyLine(line, preset.id, host, last)
      if (reading === undefined) continue
      if (reading.startsRow) {
        last.entryId = reading.finding.entryId
        last.moduleName = reading.finding.moduleName
      }
      findings.push(reading.finding)
      if (reading.finding.duplicateName !== null) {
        claims.add(`${preset.id}: ${reading.finding.registry ?? 'name'} "${reading.finding.duplicateName}"`)
      }
    }
    if (findings.length > 0) rows.push({ presetId: preset.id, findings })
  }

  return {
    presets: rows,
    hostModules: [...host].sort((left, right) => left.localeCompare(right)),
    collisions: [...claims].sort((left, right) => left.localeCompare(right)),
  }
}

/** One line per finding, in the form a reader can paste into a report. */
export function formatFinding(finding: Finding): string {
  const owner = finding.moduleName === null
    ? finding.entryId ?? 'preset row'
    : `${finding.entryId ?? '?'} (${finding.moduleName})`
  const target = finding.duplicateName === null
    ? finding.message
    : `${finding.registry ?? 'name'} "${finding.duplicateName}"`
  const where = finding.hostPlaneShared
    ? ROW_HINT_HOST
    : finding.kind === 'global-layer-duplicate'
      ? ROW_HINT_GLOBAL
      : finding.kind === 'scoped-duplicate'
        ? ROW_HINT_SCOPED
        : finding.kind === 'scope-required'
          ? ROW_HINT_SCOPE_REQUIRED
          : ''
  return `preset ${finding.presetId}: ${owner} → ${target}${where === '' ? '' : ` — ${where}`}`
}

/** What to do about a name two planes both own. */
export const ROW_HINT_HOST = 'this module is also mounted at the deployment plane; keep it in one of the two lists'
/** A global-layer rejection whose module is not mounted at the deployment plane. */
export const ROW_HINT_GLOBAL = 'the row registered on the deployment plane instead of its own scope'
/** Two rows of one preset claim the same name. */
export const ROW_HINT_SCOPED = 'two rows of this preset declare the same name'
/** A row that refuses to run without a scoped preset context. */
export const ROW_HINT_SCOPE_REQUIRED = 'the row did not receive a scoped preset context'
