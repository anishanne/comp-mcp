export interface MethodSpec {
    name: string;
    category: string;
    description: string;
    parameters: string;
    returns: string;
    example: string;
    /** True if the method mutates database state. Omitted/false means read-only. */
    write?: boolean;
}
export declare const API_SPEC: MethodSpec[];
/**
 * Search the API spec for methods matching a query string.
 * Case-insensitive match on name, category, and description.
 * When `readOnly` is true, write methods are excluded from results.
 */
export declare function searchSpec(query: string, options?: {
    readOnly?: boolean;
}): MethodSpec[];
/**
 * The canonical list of write-method paths (e.g. "students.transferToTeam").
 * Derived from API_SPEC so the runtime enforcement and the spec filter share
 * one source of truth. Used to build a read-only wrapper around the api object.
 */
export declare const WRITE_METHOD_PATHS: ReadonlySet<string>;
