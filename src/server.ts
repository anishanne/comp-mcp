import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchSpec } from "./spec/api-spec.js";
import { TYPE_DEFINITIONS } from "./spec/types.js";
import { executeCode } from "./executor.js";
import { CompAPI } from "./sdk/index.js";

export function createServer(
  api: CompAPI,
  options: { readOnly?: boolean } = {}
): McpServer {
  const readOnly = !!options.readOnly;
  const modeLabel = readOnly ? " (read-only)" : "";

  const server = new McpServer({
    name: "comp-code-mode",
    version: "1.0.0",
  });

  // ── search tool ──
  server.tool(
    "search",
    `Search the COMP API for available methods${modeLabel}. Returns matching method signatures, descriptions, and usage examples. Use this before writing code to find the right methods.${readOnly ? "\n\nThis connection is read-only: write methods (create/update/delete/transfer/refund) are not listed and cannot be called." : ""}`,
    { query: z.string().describe("Search query (e.g. 'students', 'refund', 'teams transfer')") },
    async ({ query }) => {
      const results = searchSpec(query, { readOnly });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No methods found for "${query}". Try broader terms like: events, students, teams, orgs, tickets, tests, analytics, export`,
            },
          ],
        };
      }

      const text = results
        .map(
          (m) =>
            `### ${m.name}${m.parameters}\n**Returns:** ${m.returns}\n${m.description}\n**Example:** \`${m.example}\``
        )
        .join("\n\n");

      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  // ── execute tool ──
  server.tool(
    "execute",
    `Execute JavaScript code against the COMP API${modeLabel}. The \`api\` object is pre-configured with Supabase access scoped to the configured events.

Write async JavaScript that uses \`api\` methods and returns a result. The code runs in an async context — use \`await\` freely and \`return\` the final value.
${readOnly ? "\nThis connection is read-only: only read methods are exposed. Any call to a write method (create/update/delete/transfer/refund) throws.\n" : ""}
## Available API categories:
- api.events — event info, tests, registrations, custom fields
- api.students — student queries${readOnly ? "" : ", transfers"}, search, ticket info
- api.teams — team ${readOnly ? "queries, members, available tickets" : "management, transfers, creation, deletion"}
- api.orgs — organization details, coaches, ticket counts
- api.tickets — ticket orders${readOnly ? ", refund queries" : ", refund management"}, revenue
- api.tests — test info, results, grading stats
- api.analytics — registration, ticket, grade, and custom field statistics
- api.export — data exports (JSON/CSV)

Use the \`search\` tool first to find specific method signatures.

${TYPE_DEFINITIONS}`,
    { code: z.string().describe("JavaScript code to execute. Use `await` for async calls and `return` the result.") },
    async ({ code }) => {
      const result = await executeCode(code, api);
      return {
        content: [{ type: "text" as const, text: result }],
      };
    }
  );

  return server;
}
