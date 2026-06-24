import type { MCPProvider, MCPToolDefinition, MCPToolResult, RequestContext } from '../provider/types.js';

interface RegisteredTool {
  definition: MCPToolDefinition;
  provider: MCPProvider;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  registerTools(provider: MCPProvider): void {
    for (const definition of provider.getTools()) {
      if (this.tools.has(definition.name)) {
        throw new Error(`Duplicate tool registered: ${definition.name}`);
      }
      this.tools.set(definition.name, { definition, provider });
    }
  }

  getDefinition(toolName: string): MCPToolDefinition {
    const entry = this.tools.get(toolName);
    if (!entry) throw new Error(`Tool not found: ${toolName}`);
    return entry.definition;
  }

  listDefinitions(): MCPToolDefinition[] {
    return [...this.tools.values()].map((entry) => entry.definition);
  }

  async call(toolName: string, args: Record<string, unknown>, context: RequestContext): Promise<MCPToolResult> {
    const entry = this.tools.get(toolName);
    if (!entry) throw new Error(`Tool not found: ${toolName}`);
    return entry.provider.callTool(toolName, args, context);
  }
}
