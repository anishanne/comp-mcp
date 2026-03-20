import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createAPI } from "./sdk/index.js";
import { createServer } from "./server.js";
import { SimpleOAuthProvider } from "./auth.js";

const PORT = parseInt(process.env.PORT || "8787", 10);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!AUTH_TOKEN) {
  console.error("Missing MCP_AUTH_TOKEN");
  process.exit(1);
}

// ── Event scoping ──
const EVENT_IDS = (process.env.COMP_EVENT_IDS || "")
  .split(",")
  .map(Number)
  .filter(Boolean);
const EVENT_NAMES = (process.env.COMP_EVENT_NAMES || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (EVENT_IDS.length === 0) {
  console.error("Missing COMP_EVENT_IDS — provide comma-separated event IDs");
  process.exit(1);
}

console.log(`Configured events: ${EVENT_IDS.map((id, i) => `#${id} (${EVENT_NAMES[i] || "unnamed"})`).join(", ")}`);

const provider = new SimpleOAuthProvider(AUTH_TOKEN);

const app = express();

// ── Request logger ──
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`[${req.method}] ${req.url} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// ── OAuth endpoints (/.well-known/*, /authorize, /token, /register) ──
const baseUrl = process.env.BASE_URL
  ? new URL(process.env.BASE_URL)
  : new URL(`http://localhost:${PORT}`);

app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: baseUrl,
    baseUrl,
  })
);

// ── /approve endpoint — validates password, issues auth code ──
app.post("/approve", express.json(), (req, res) => {
  const { clientId, redirectUri, codeChallenge, state, token } = req.body;
  console.log("[approve] clientId length:", clientId?.length, "redirectUri:", redirectUri, "has codeChallenge:", !!codeChallenge, "has state:", !!state);

  if (token !== AUTH_TOKEN) {
    console.log("[approve] REJECTED: token mismatch");
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const code = provider.generateAuthorizationCode(
    clientId,
    codeChallenge,
    redirectUri
  );
  console.log("[approve] OK: generated auth code, length:", code.length);

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  res.json({ redirectUrl: redirectUrl.toString() });
});

// ── MCP endpoint (bearer-auth protected) ──
const bearerAuth = requireBearerAuth({ verifier: provider });

app.post("/mcp", bearerAuth, async (req, res) => {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const api = createAPI(supabase, EVENT_IDS);
  const mcpServer = createServer(api);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);

  res.on("close", () => {
    transport.close();
    mcpServer.close();
  });
});

// GET and DELETE not supported in stateless mode
app.get("/mcp", bearerAuth, (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. Use POST for stateless mode.",
    },
    id: null,
  });
});

app.delete("/mcp", bearerAuth, (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. Use POST for stateless mode.",
    },
    id: null,
  });
});

// ── Home page ──
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "comp-code-mode",
    mcp: "/mcp",
    events: EVENT_IDS.map((id, i) => ({
      id,
      name: EVENT_NAMES[i] || `Event #${id}`,
    })),
  });
});

// ── Export for Vercel, listen for local dev ──
export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`MCP server listening on http://localhost:${PORT}/mcp`);
    console.log(`OAuth metadata at http://localhost:${PORT}/.well-known/oauth-authorization-server`);
  });
}

process.on("SIGINT", () => {
  console.log("Shutting down...");
  process.exit(0);
});
