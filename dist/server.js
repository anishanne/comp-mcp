import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchSpec } from "./spec/api-spec.js";
import { TYPE_DEFINITIONS } from "./spec/types.js";
import { executeCode } from "./executor.js";
export function createServer(api, options = {}) {
    const readOnly = !!options.readOnly;
    const modeLabel = readOnly ? " (read-only)" : "";
    const server = new McpServer({
        name: "comp-code-mode",
        version: "1.0.0",
    });
    // ── search tool ──
    server.tool("search", `Search the COMP API for available methods${modeLabel}. Returns matching method signatures, descriptions, and usage examples. Use this before writing code to find the right methods.

## Identifier convention — IMPORTANT

When you report results to the user, ALWAYS refer to students and teams by their **front_id** (plus name). front_id is the user-facing ID printed on badges and scorecards — it is the ONLY identifier the user will recognize. Never show the user test_taker_id, student_id (UUID), or internal team_id in your response text. You may still use those IDs internally for joins or follow-up queries; just don't surface them as "IDs" in your final answer.

When the user mentions a student or team by ID, that ID is their front_id. Look them up with \`api.students.getByFrontId\` / \`api.teams.getByFrontId\` or \`api.students.search({ frontId })\` / \`api.teams.search(eventId, { frontId })\`.${readOnly ? "\n\nThis connection is read-only: write methods (create/update/delete/transfer/refund) are not listed and cannot be called." : ""}`, { query: z.string().describe("Search query (e.g. 'students', 'refund', 'teams transfer', 'front_id')") }, async ({ query }) => {
        const results = searchSpec(query, { readOnly });
        if (results.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No methods found for "${query}". Try broader terms like: events, students, teams, orgs, tickets, tests, analytics, export`,
                    },
                ],
            };
        }
        const text = results
            .map((m) => `### ${m.name}${m.parameters}\n**Returns:** ${m.returns}\n${m.description}\n**Example:** \`${m.example}\``)
            .join("\n\n");
        return {
            content: [{ type: "text", text }],
        };
    });
    // ── execute tool ──
    server.tool("execute", `Execute JavaScript code against the COMP API${modeLabel}. The \`api\` object is pre-configured with Supabase access scoped to the configured events.

Write async JavaScript that uses \`api\` methods and returns a result. The code runs in an async context — use \`await\` freely and \`return\` the final value.
${readOnly ? "\nThis connection is read-only: only read methods are exposed. Any call to a write method (create/update/delete/transfer/refund) throws.\n" : ""}
## Identifier convention — ALWAYS USE front_id WHEN TALKING TO THE USER

front_id is the **user-facing numeric ID** (shown on badges, scorecards, rosters). It is the only ID the user recognizes. Internally you can use any ID (test_taker_id, student_id UUID, team_id) for joins and queries, but when composing your final answer to the user:

- Refer to a student/team by \`front_id\` and their name. E.g. "#142 Jane Doe scored 38 on Algebra" — NOT "student abc-def-... scored 38".
- When returning JSON from \`execute\`, put \`front_id\` first in each row and drop internal IDs unless the user explicitly asked for them (use \`.map(r => ({ front_id: r.front_id, name: r.name, ... }))\` to project).
- When the user references a student/team by a number ("team 31", "student 142"), that number IS their front_id — look them up with \`api.students.getByFrontId(eventId, frontId)\` or \`api.teams.getByFrontId(eventId, frontId)\`.
- Every method that returns takers/students/teams surfaces \`front_id\` on each row. If you need front_ids for a list of test_taker_ids, every leaderboard/findAnswers/findAnswerCollisions already enriches them.

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

${TYPE_DEFINITIONS}`, { code: z.string().describe("JavaScript code to execute. Use `await` for async calls and `return` the result.") }, async ({ code }) => {
        const result = await executeCode(code, api);
        return {
            content: [{ type: "text", text: result }],
        };
    });
    return server;
}
//# sourceMappingURL=server.js.map