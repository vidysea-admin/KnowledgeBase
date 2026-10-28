import type { parseRoutingYaml, Provider, WriteJobFn } from '@lkb/ai';
/** Composition's type seam has no reverse dependency on its production caller. */
export interface IntegrationRouting {
  chains: ReturnType<typeof parseRoutingYaml>;
  providers: Record<string, Provider>;
  jobWrite: WriteJobFn;
}
