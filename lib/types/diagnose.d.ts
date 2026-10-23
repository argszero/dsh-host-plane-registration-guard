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
'global-layer-duplicate'
/** Two rows of the same preset scope declare the same name. */
 | 'scoped-duplicate'
/** A row demands a scoped preset context and received none. */
 | 'scope-required'
/** A failure this plugin cannot classify; reported verbatim so it is not lost. */
 | 'other';
/** One registry name two owners both claim. */
export interface Finding {
    /** Preset whose mount reported the failure. */
    readonly presetId: string;
    /** Entry id of the failing row, or null when the line carries none. */
    readonly entryId: string | null;
    /** Module specifier of the failing row, or null when the line carries none. */
    readonly moduleName: string | null;
    /** The layer the rejected registration hit. */
    readonly kind: FindingKind;
    /** The duplicated registry name (section, context, variable or tool), when named. */
    readonly duplicateName: string | null;
    /** The registry that owns the name (`section`, `context`, `variable`, `tool`). */
    readonly registry: string | null;
    /** Whether the same module is also mounted at the deployment plane. */
    readonly hostPlaneShared: boolean;
    /** The reported text, verbatim, for a reader who needs what the core said. */
    readonly message: string;
}
/** One preset's verdict. */
export interface PresetDiagnosis {
    readonly presetId: string;
    readonly findings: readonly Finding[];
}
/** The whole report. */
export interface Diagnosis {
    readonly presets: readonly PresetDiagnosis[];
    /** Module specifiers mounted at the deployment plane, as the loader sees them. */
    readonly hostModules: readonly string[];
    /** Distinct `(preset, registry, name)` claims, for a one-line summary. */
    readonly collisions: readonly string[];
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
export declare function diagnose(presets: readonly {
    readonly id: string;
    readonly broken?: string;
}[], hostModules: readonly string[]): Diagnosis;
/** One line per finding, in the form a reader can paste into a report. */
export declare function formatFinding(finding: Finding): string;
/** What to do about a name two planes both own. */
export declare const ROW_HINT_HOST = "this module is also mounted at the deployment plane; keep it in one of the two lists";
/** A global-layer rejection whose module is not mounted at the deployment plane. */
export declare const ROW_HINT_GLOBAL = "the row registered on the deployment plane instead of its own scope";
/** Two rows of one preset claim the same name. */
export declare const ROW_HINT_SCOPED = "two rows of this preset declare the same name";
/** A row that refuses to run without a scoped preset context. */
export declare const ROW_HINT_SCOPE_REQUIRED = "the row did not receive a scoped preset context";
