import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchSpec } from "./spec/api-spec.js";
import { TYPE_DEFINITIONS } from "./spec/types.js";
import { executeCode } from "./executor.js";
import { CompAPI } from "./sdk/index.js";

export function createServer(api: CompAPI): McpServer {
  const server = new McpServer({
    name: "comp-code-mode",
    version: "1.0.0",
  });

  // ── search tool ──
  server.tool(
    "search",
    `Search the COMP API for available methods. Returns matching method signatures, descriptions, and usage examples. Use this before writing code to find the right methods.`,
    { query: z.string().describe("Search query (e.g. 'students', 'refund', 'teams transfer')") },
    async ({ query }) => {
      const results = searchSpec(query);

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
    `Execute JavaScript code against the COMP API. The \`api\` object is pre-configured with Supabase access scoped to the configured events.

Write async JavaScript that uses \`api\` methods and returns a result. The code runs in an async context — use \`await\` freely and \`return\` the final value.

## Available API categories:
- api.events — event info, tests, registrations, custom fields
- api.students — student queries, transfers, search, ticket info
- api.teams — team management, transfers, creation, deletion
- api.orgs — organization details, coaches, ticket counts
- api.tickets — ticket orders, refund management, revenue
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
