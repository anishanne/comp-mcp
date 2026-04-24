import vm from "node:vm";
import { CompAPI } from "./sdk/index.js";
import { truncateResponse } from "./truncate.js";

const EXECUTION_TIMEOUT_MS = 30_000;

/**
 * Execute user-provided JavaScript code in a sandboxed VM context.
 * Only `api` and safe builtins are available — no process, require, fetch, import, etc.
 */
export async function executeCode(
  code: string,
  api: CompAPI
): Promise<string> {
  try {
    // Build a minimal sandbox context — only expose what's needed
    const logs: string[] = [];
    const sandbox: Record<string, any> = {
      api,
      console: {
        log: (...args: any[]) => logs.push(args.map(String).join(" ")),
        warn: (...args: any[]) => logs.push(args.map(String).join(" ")),
        error: (...args: any[]) => logs.push(args.map(String).join(" ")),
      },
      // Safe builtins
      JSON,
      Math,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      // Explicitly block dangerous globals
      process: undefined,
      require: undefined,
      global: undefined,
      globalThis: undefined,
      fetch: undefined,
      eval: undefined,
      Function: undefined,
      Proxy: undefined,
      Reflect: undefined,
      __dirname: undefined,
      __filename: undefined,
      module: undefined,
      exports: undefined,
      import: undefined,
    };

    const context = vm.createContext(sandbox, {
      codeGeneration: { strings: false, wasm: false },
    });

    // Wrap code in an async IIFE so `await` and `return` work
    const wrapped = `(async () => { ${code} })()`;

    const script = new vm.Script(wrapped, {
      filename: "mcp-execute.js",
    });

    const resultPromise = script.runInContext(context, {
      timeout: EXECUTION_TIMEOUT_MS,
    }) as Promise<any>;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Execution timed out after ${EXECUTION_TIMEOUT_MS}ms`)),
        EXECUTION_TIMEOUT_MS
      )
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);

    if (result === undefined) {
      const msg = logs.length > 0
        ? `Code executed successfully (no return value).\n\nConsole output:\n${logs.join("\n")}`
        : "Code executed successfully (no return value).";
      return msg;
    }

    return truncateResponse(result);
  } catch (error: any) {
    return JSON.stringify({
      error: true,
      message: error.message || String(error),
      hint: "Check your code syntax and API method names. Use the search tool to find available methods.",
    });
  }
}
