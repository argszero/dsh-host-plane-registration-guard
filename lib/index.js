/**
 * Name the rows of a failed agent-preset mount and the plane each one hit.
 *
 * A preset that cannot mount reports every unusable row as one line of a single
 * `broken` string, and a reader sees a wall of "already registered" lines with
 * no way to tell which of their two owners is the duplicate. This plugin reads
 * the two public rosters — `agentPresets.list()` and the Loader's entry tree —
 * and turns each line into one named cause, saying whether the row registered
 * on the deployment plane or inside its own scope.
 *
 * It reads and reports; it never edits a composition, never disables a row and
 * never touches a session.
 * @module @argszero/dsh-host-plane-registration-guard
 */
import { diagnose, formatFinding } from './diagnose.js';
export { diagnose, formatFinding } from './diagnose.js';
/** Cordis plugin name. */
export const name = 'host-plane-registration-guard';
/** Defaults, applied by {@link Config}. */
const DEFAULTS = { eager: true, delayMs: 0, log: true };
/**
 * Runtime schema in the standard-schema dialect the Loader accepts, kept
 * dependency-free: this package ships no runtime dependencies.
 */
export const Config = {
    '~standard': {
        version: 1,
        vendor: 'dsh-host-plane-registration-guard',
        /**
         * Validate the declared configuration.
         * @param value - the raw configuration node.
         * @returns the configuration, or the problems that make it unusable.
         */
        validate(value) {
            const issues = [];
            const row = (value ?? {});
            if (row.eager !== undefined && typeof row.eager !== 'boolean')
                issues.push({ message: 'eager must be a boolean' });
            if (row.log !== undefined && typeof row.log !== 'boolean')
                issues.push({ message: 'log must be a boolean' });
            if (row.delayMs !== undefined && (typeof row.delayMs !== 'number' || !Number.isFinite(row.delayMs) || row.delayMs < 0)) {
                issues.push({ message: 'delayMs must be a non-negative finite number' });
            }
            if (issues.length > 0)
                return { issues };
            return { value: { ...DEFAULTS, ...row } };
        },
    },
};
/**
 * Module specifiers mounted at the deployment plane.
 *
 * Group rows are structural and carry no module of their own, so they are
 * skipped rather than reported as an unnamed owner.
 * @param loader - the Loader service.
 * @returns the specifiers, or an empty list when the Loader is unreadable.
 */
export function hostPlaneModules(loader) {
    const service = loader;
    const tree = (service?.root?.tree ?? service);
    const entries = tree?.entries;
    if (typeof entries !== 'function')
        return [];
    const found = [];
    for (const entry of entries.call(tree)) {
        if (entry.options?.group === true)
            continue;
        const specifier = entry.options?.name;
        if (typeof specifier === 'string' && specifier !== '')
            found.push(specifier);
    }
    return [...new Set(found)].sort((left, right) => left.localeCompare(right));
}
/**
 * Take one reading of every preset's mount diagnostic.
 * @param options - the context to read through and whether to log.
 * @returns the report, empty when no preset reported a failure.
 */
export async function inspect(options) {
    const { ctx, log = true } = options;
    const presets = ctx.get('agentPresets');
    const loader = ctx.get('loader');
    const hostModules = hostPlaneModules(loader);
    if (typeof presets?.list !== 'function') {
        return { presets: [], hostModules, collisions: [] };
    }
    const roster = await presets.list();
    const report = diagnose(Array.isArray(roster) ? roster : [], hostModules);
    if (log && report.presets.length > 0) {
        const lines = report.presets.flatMap(row => row.findings.map(finding => formatFinding(finding)));
        ctx.logger?.warn('agent preset mounts failed; per-row causes:\n%s', lines.join('\n'));
        if (report.collisions.length > 0) {
            ctx.logger?.warn('names claimed twice: %s', report.collisions.join('; '));
        }
    }
    return report;
}
/**
 * Mount the plugin: take one reading after activation unless configured off.
 * @param ctx - the plugin's context.
 * @param config - declared configuration.
 */
export function apply(ctx, config = DEFAULTS) {
    if (!config.eager)
        return;
    const handle = setTimeout(() => { void inspect({ ctx, log: config.log }).catch(() => { }); }, config.delayMs);
    // A doctor must never hold the process open on its own account.
    handle.unref?.();
    ctx.effect?.(() => () => { clearTimeout(handle); }, 'host-plane-registration-guard.reading');
}
export default { name, Config, apply };
