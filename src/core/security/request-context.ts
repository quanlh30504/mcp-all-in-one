import { randomUUID } from 'node:crypto';
import type { RequestContext } from '../provider/types.js';

export function createRequestContext(input: {
  tenantId: string;
  userId: string;
  roles: string[];
  correlationId?: string;
  environment?: string;
}): RequestContext {
  return {
    requestId: randomUUID(),
    correlationId: input.correlationId ?? randomUUID(),
    tenantId: input.tenantId,
    userId: input.userId,
    roles: input.roles,
    environment: input.environment,
    tainted: false,
    dataClassifications: []
  };
}
