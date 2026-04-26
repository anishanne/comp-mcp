import { CompAPI } from "./sdk/index.js";
/**
 * Execute user-provided JavaScript code in a sandboxed VM context.
 * Only `api` and safe builtins are available — no process, require, fetch, import, etc.
 */
export declare function executeCode(code: string, api: CompAPI): Promise<string>;
