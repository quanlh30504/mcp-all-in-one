import type { MCPProvider, MCPResourceDefinition, MCPResourceResult, RequestContext } from '../provider/types.js';

export class ResourceRegistry {
  private readonly resources: Array<{ definition: MCPResourceDefinition; provider: MCPProvider }> = [];

  registerResources(provider: MCPProvider): void {
    for (const definition of provider.getResources?.() ?? []) {
      this.resources.push({ definition, provider });
    }
  }

  listDefinitions(): MCPResourceDefinition[] {
    return this.resources.map((entry) => entry.definition);
  }

  async read(uri: string, context: RequestContext): Promise<MCPResourceResult> {
    const entry = this.resources.find((item) => matchesTemplate(uri, item.definition.uriTemplate));
    if (!entry || !entry.provider.readResource) throw new Error(`Resource not found: ${uri}`);
    return entry.provider.readResource(uri, context);
  }
}

function matchesTemplate(uri: string, template: string): boolean {
  const prefix = template.split('{')[0];
  return uri.startsWith(prefix);
}
