import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CompAPI } from "./sdk/index.js";
export declare function createServer(api: CompAPI, options?: {
    readOnly?: boolean;
}): McpServer;
