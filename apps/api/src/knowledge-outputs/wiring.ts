import type { Db } from "mongodb";
import { lookupEffectivePolicy } from "../answer-policy/application.js";
import type { AnswerPolicyService } from "../answer-policy/service.js";
import type { OutputDeps } from "./types.js";
import { createOutputService } from "./service.js";
import { createMongoOutputReader } from "./reader.js";
import { createMongoOutputRepository } from "./repository.js";

/** Central composition supplies its real tenant-bound provider chain and policy service. */
export function createConfiguredOutputService(db: Db, complete: OutputDeps["complete"], policies: AnswerPolicyService, verify: OutputDeps["complete"]) {
  return createOutputService({ repository: createMongoOutputRepository(db), readSources: createMongoOutputReader(db), complete, verify,
    policy: (tenantId, selection) => lookupEffectivePolicy(policies, tenantId, selection) });
}
