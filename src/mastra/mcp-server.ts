import http from 'http';
import { mastra } from './index';
import { MCPServer } from '@mastra/mcp';

const PORT = parseInt(process.env.MASTRA_MCP_PORT || '4112', 10);
const MCP_PATH = process.env.MASTRA_MCP_PATH || '/mcp';

async function main() {
  // Get agents from the mastra instance
  const agents = mastra.listAgents();

  if (!agents || Object.keys(agents).length === 0) {
    console.error('No agents found in Mastra instance');
    process.exit(1);
  }

  console.log('Exposing agents as MCP tools:', Object.keys(agents).join(', '));

  const mcpServer = new MCPServer({
    name: 'Mastra-Rkeeper-MCP',
    version: '1.0.0',
    description: 'MCP server exposing Mastra Rkeeper agents as tools for Hermes',
    instructions:
      'This MCP server provides access to Rkeeper analytics agents. Use the ask_sqlAgent tool to execute SQL queries against the Rkeeper database.',
    agents
  } as any);

  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || 'localhost';
    const url = new URL(req.url || '/', `http://${host}`);

    try {
      await mcpServer.startHTTP({
        url,
        httpPath: MCP_PATH,
        req,
        res,
        options: {}
      } as any);
    } catch (err) {
      console.error('MCP request error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mastra MCP server listening on http://0.0.0.0:${PORT}${MCP_PATH}`);
    console.log(`Hermes config: mcp_servers.mastra: url=http://mastra-mcp:${PORT}${MCP_PATH}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
