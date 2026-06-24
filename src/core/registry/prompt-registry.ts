import type { MCPPromptDefinition, MCPProvider } from '../provider/types.js';

export class PromptRegistry {
  private readonly prompts = new Map<string, MCPPromptDefinition>();

  registerPrompts(provider: MCPProvider): void {
    for (const prompt of provider.getPrompts?.() ?? []) {
      if (!prompt.reviewed) {
        throw new Error(`Prompt template is not reviewed: ${prompt.name}`);
      }
      if (this.prompts.has(prompt.name)) {
        throw new Error(`Duplicate prompt registered: ${prompt.name}`);
      }
      this.prompts.set(prompt.name, prompt);
    }
  }

  listDefinitions(): MCPPromptDefinition[] {
    return [...this.prompts.values()];
  }
}
