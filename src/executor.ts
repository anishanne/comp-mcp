import { CompAPI } from "./sdk/index.js";
import { truncateResponse } from "./truncate.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const EXECUTION_TIMEOUT_MS = 30_000;

/**
 * Execute user-provided JavaScript code with the API object in scope.
 * The code should return a value — the last expression or an explicit return.
 */
export async function executeCode(
  code: string,
  api: CompAPI
): Promise<string> {
  try {
    const fn = new AsyncFunction("api", code) as (
      api: CompAPI
    ) => Promise<any>;

    const resultPromise = fn(api);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Execution timed out after ${EXECUTION_TIMEOUT_MS}ms`)),
        EXECUTION_TIMEOUT_MS
      )
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);

    if (result === undefined) {
      return "Code executed successfully (no return value).";
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
