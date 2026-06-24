import type { MCPProvider, MCPProviderFactory, ProviderRuntimeConfig } from './types.js';
import { validateProviderManifest } from './provider-manifest-validator.js';

export class ProviderManager {
  private readonly providers = new Map<string, MCPProvider>();

  async register(factory: MCPProviderFactory, config: ProviderRuntimeConfig): Promise<MCPProvider> {
    validateProviderManifest(factory.manifest);

    const provider = factory.create();
    await provider.initialize(config);

    if (this.providers.has(provider.name)) {
      throw new Error(`Provider already registered: ${provider.name}`);
    }

    this.providers.set(provider.name, provider);
    return provider;
  }

  getProvider(name: string): MCPProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Provider not found: ${name}`);
    return provider;
  }

  listProviders(): MCPProvider[] {
    return [...this.providers.values()];
  }
}
