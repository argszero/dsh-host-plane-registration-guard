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
/** A row line: `entry-id (module-specifier): message`; every part is optional in practice. */
const ROW_LINE = /^(?<entry>[^\s()]+)\s+\((?<module>[^()]+)\):\s*(?<message>.*)$/u;
/** A duplicate-registration message, whichever layer produced it. */
const DUPLICATE = /^(?<registry>prompt section|prompt context|prompt variable|tool)\s+"(?<name>[^"]+)" is already registered(?<tail>.*)$/u;
/** The hint the global layer appends, and the scoped layer never does. */
const GLOBAL_HINT = /\(for a per-(?:agent|agent's value)/u;
/** The scoped layer's own wording. */
const SCOPED_HINT = /already registered in this scope/u;
/**
 * Read one line of a `broken` diagnostic.
 * @param line - one line, already split.
 * @param presetId - preset the diagnostic belongs to.
 * @param hostModules - deployment-plane module specifiers.
 * @param last - entry id of the row this line may continue, if any.
 * @returns the reading, or undefined for a line that carries no finding.
 */
function classifyLine(line, presetId, hostModules, last) {
    const text = line.trimEnd();
    if (text.trim() === '')
        return undefined;
    // A cause rendered beneath its row (`- member message`) is detail of the row
    // above, never an independent registration of its own.
    if (/^\s*-\s/u.test(text))
        return undefined;
    const row = ROW_LINE.exec(text.trimStart());
    const entryId = row?.groups?.['entry'] ?? last.entryId;
    const moduleName = row?.groups?.['module'] ?? null;
    const message = (row?.groups?.['message'] ?? text).trim();
    const startsRow = row !== null;
    const duplicate = DUPLICATE.exec(message);
    let kind;
    if (duplicate !== null) {
        // The factories differ only here: a global-layer rejection asks the caller
        // to re-register through a per-agent context, a scoped one does not.
        kind = GLOBAL_HINT.test(message) || !SCOPED_HINT.test(message) ? 'global-layer-duplicate' : 'scoped-duplicate';
    }
    else if (/requires a scoped (?:preset )?[Cc]ontext/u.test(message)) {
        kind = 'scope-required';
    }
    else {
        kind = 'other';
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
    };
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
export function diagnose(presets, hostModules) {
    const host = new Set(hostModules);
    const rows = [];
    const claims = new Set();
    for (const preset of presets) {
        if (preset.broken === undefined || preset.broken === '')
            continue;
        const findings = [];
        const last = { entryId: null, moduleName: null };
        for (const line of preset.broken.split('\n')) {
            const reading = classifyLine(line, preset.id, host, last);
            if (reading === undefined)
                continue;
            if (reading.startsRow) {
                last.entryId = reading.finding.entryId;
                last.moduleName = reading.finding.moduleName;
            }
            findings.push(reading.finding);
            if (reading.finding.duplicateName !== null) {
                claims.add(`${preset.id}: ${reading.finding.registry ?? 'name'} "${reading.finding.duplicateName}"`);
            }
        }
        if (findings.length > 0)
            rows.push({ presetId: preset.id, findings });
    }
    return {
        presets: rows,
        hostModules: [...host].sort((left, right) => left.localeCompare(right)),
        collisions: [...claims].sort((left, right) => left.localeCompare(right)),
    };
}
/** One line per finding, in the form a reader can paste into a report. */
export function formatFinding(finding) {
    const owner = finding.moduleName === null
        ? finding.entryId ?? 'preset row'
        : `${finding.entryId ?? '?'} (${finding.moduleName})`;
    const target = finding.duplicateName === null
        ? finding.message
        : `${finding.registry ?? 'name'} "${finding.duplicateName}"`;
    const where = finding.hostPlaneShared
        ? ROW_HINT_HOST
        : finding.kind === 'global-layer-duplicate'
            ? ROW_HINT_GLOBAL
            : finding.kind === 'scoped-duplicate'
                ? ROW_HINT_SCOPED
                : finding.kind === 'scope-required'
                    ? ROW_HINT_SCOPE_REQUIRED
                    : '';
    return `preset ${finding.presetId}: ${owner} → ${target}${where === '' ? '' : ` — ${where}`}`;
}
/** What to do about a name two planes both own. */
export const ROW_HINT_HOST = 'this module is also mounted at the deployment plane; keep it in one of the two lists';
/** A global-layer rejection whose module is not mounted at the deployment plane. */
export const ROW_HINT_GLOBAL = 'the row registered on the deployment plane instead of its own scope';
/** Two rows of one preset claim the same name. */
export const ROW_HINT_SCOPED = 'two rows of this preset declare the same name';
/** A row that refuses to run without a scoped preset context. */
export const ROW_HINT_SCOPE_REQUIRED = 'the row did not receive a scoped preset context';
