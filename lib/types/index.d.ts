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
import { type Diagnosis } from './diagnose.js';
export { diagnose, formatFinding } from './diagnose.js';
export type { Diagnosis, Finding, FindingKind, PresetDiagnosis } from './diagnose.js';
/** Cordis plugin name. */
export declare const name = "host-plane-registration-guard";
/** Plugin configuration. */
export interface Config {
    /** Take one reading when the plugin activates; false leaves it to an explicit call. */
    eager: boolean;
    /** Milliseconds to wait before the automatic reading, for a Host tree still settling. */
    delayMs: number;
    /** Log the reading once. */
    log: boolean;
}
/**
 * Runtime schema in the standard-schema dialect the Loader accepts, kept
 * dependency-free: this package ships no runtime dependencies.
 */
export declare const Config: {
    '~standard': {
        version: 1;
        vendor: string;
        /**
         * Validate the declared configuration.
         * @param value - the raw configuration node.
         * @returns the configuration, or the problems that make it unusable.
         */
        validate(value: unknown): {
            value: Config;
        } | {
            issues: {
                message: string;
            }[];
        };
    };
};
/** The slice of a Cordis context this plugin uses. */
interface Context {
    get(name: string): unknown;
    effect?(callback: () => unknown, label?: string): unknown;
    logger?: {
        warn(...args: unknown[]): void;
    };
}
/**
 * Module specifiers mounted at the deployment plane.
 *
 * Group rows are structural and carry no module of their own, so they are
 * skipped rather than reported as an unnamed owner.
 * @param loader - the Loader service.
 * @returns the specifiers, or an empty list when the Loader is unreadable.
 */
export declare function hostPlaneModules(loader: unknown): string[];
/** What one reading needs from its caller. */
export interface InspectOptions {
    /** The runtime context to read the rosters through. */
    readonly ctx: Context;
    /** Report the reading through the context logger. */
    readonly log?: boolean;
}
/**
 * Take one reading of every preset's mount diagnostic.
 * @param options - the context to read through and whether to log.
 * @returns the report, empty when no preset reported a failure.
 */
export declare function inspect(options: InspectOptions): Promise<Diagnosis>;
/**
 * Mount the plugin: take one reading after activation unless configured off.
 * @param ctx - the plugin's context.
 * @param config - declared configuration.
 */
export declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
    name: string;
    Config: {
        '~standard': {
            version: 1;
            vendor: string;
            /**
             * Validate the declared configuration.
             * @param value - the raw configuration node.
             * @returns the configuration, or the problems that make it unusable.
             */
            validate(value: unknown): {
                value: Config;
            } | {
                issues: {
                    message: string;
                }[];
            };
        };
    };
    apply: typeof apply;
};
export default _default;
