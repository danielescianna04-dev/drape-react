import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { log } from '../utils/logger';
import type { ToolDefinition } from './ai-provider.service';
import { fileService } from './file.service';

interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

const activeClients = new Map<string, Client>();

// Cache MCP tools per project to avoid re-reading config files every iteration
const mcpToolsCache = new Map<string, { tools: ToolDefinition[]; expiresAt: number }>();
const MCP_CACHE_TTL = 300_000; // 5 minutes

/**
 * Connect to an MCP server via stdio transport.
 */
export async function connectMcpServer(name: string, config: McpServerConfig): Promise<Client> {
  if (activeClients.has(name)) return activeClients.get(name)!;

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args || [],
    env: { ...process.env, ...(config.env || {}) } as Record<string, string>,
  });

  const client = new Client({ name: `drape-${name}`, version: '1.0.0' }, {});
  await client.connect(transport);
  activeClients.set(name, client);
  log.info(`[MCP] Connected to server: ${name}`);
  return client;
}

/**
 * Get tool definitions from a specific MCP server.
 * Tool names are prefixed with `mcp_<serverName>_` to avoid collisions.
 */
export async function getMcpTools(serverName: string): Promise<ToolDefinition[]> {
  const client = activeClients.get(serverName);
  if (!client) return [];

  try {
    const { tools } = await client.listTools();
    return tools.map(t => ({
      name: `mcp_${serverName}_${t.name}`,
      description: `[MCP:${serverName}] ${t.description || t.name}`,
      input_schema: (t.inputSchema as any) || { type: 'object', properties: {}, required: [] },
    }));
  } catch (e: any) {
    log.warn(`[MCP] Failed to list tools for ${serverName}: ${e.message}`);
    return [];
  }
}

/**
 * Get all tools from all connected MCP servers.
 */
export async function getAllMcpTools(): Promise<ToolDefinition[]> {
  const allTools: ToolDefinition[] = [];
  for (const serverName of activeClients.keys()) {
    const tools = await getMcpTools(serverName);
    allTools.push(...tools);
  }
  return allTools;
}

/**
 * Call a tool on an MCP server.
 */
export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: any,
): Promise<{ success: boolean; content: string }> {
  const client = activeClients.get(serverName);
  if (!client) return { success: false, content: `MCP server "${serverName}" not connected` };

  // Strip the mcp_serverName_ prefix to get the original tool name
  const originalName = toolName.replace(`mcp_${serverName}_`, '');

  try {
    const result = await client.callTool({ name: originalName, arguments: args });
    const content = Array.isArray(result.content)
      ? result.content.map((c: any) => c.text || JSON.stringify(c)).join('\n')
      : String(result.content || '');

    return { success: !result.isError, content };
  } catch (e: any) {
    return { success: false, content: `MCP tool error: ${e.message}` };
  }
}

/**
 * Load MCP config from project and connect to configured servers.
 */
export async function initMcpServers(projectId: string): Promise<ToolDefinition[]> {
  // Return cached tools if still fresh (avoid re-reading config every iteration)
  const cached = mcpToolsCache.get(projectId);
  if (cached && Date.now() < cached.expiresAt) return cached.tools;

  const configFiles = ['.drape/mcp.json', '.agents/mcp.json'];

  for (const file of configFiles) {
    try {
      const result = await fileService.readFile(projectId, file);
      if (!result.success || !result.data?.content) continue;

      const config = JSON.parse(result.data.content) as Record<string, McpServerConfig>;
      const allTools: ToolDefinition[] = [];

      for (const [name, serverConfig] of Object.entries(config)) {
        try {
          await connectMcpServer(name, serverConfig);
          const tools = await getMcpTools(name);
          allTools.push(...tools);
          log.info(`[MCP] Loaded ${tools.length} tools from ${name}`);
        } catch (e: any) {
          log.warn(`[MCP] Failed to connect to ${name}: ${e.message}`);
        }
      }

      mcpToolsCache.set(projectId, { tools: allTools, expiresAt: Date.now() + MCP_CACHE_TTL });
      return allTools;
    } catch { /* invalid config */ }
  }

  // No config found — cache empty result too (avoid re-reading every iteration)
  mcpToolsCache.set(projectId, { tools: [], expiresAt: Date.now() + MCP_CACHE_TTL });
  return [];
}

/**
 * Disconnect all MCP servers.
 */
export async function disconnectAllMcp(): Promise<void> {
  for (const [name, client] of activeClients) {
    try {
      await client.close();
    } catch {}
    log.info(`[MCP] Disconnected ${name}`);
  }
  activeClients.clear();
}
