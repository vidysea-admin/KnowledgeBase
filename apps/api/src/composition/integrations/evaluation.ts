import { isAbsolute, relative, resolve } from "node:path";
import type { Db } from "mongodb";
import type { IntegrationRouting } from "./types.js";
import type { BoundIndexer } from "../../indexing/session.js";
import type { AskRouteDeps } from "../../routes/ask/ask.js";
import type { SourceIntakeDeps } from "../../source-intake/store.js";
import type { ChampionshipStore } from "../../routes/championship/championship.js";
import { createMongoChampionshipStore } from "../../championship/mongo-store.js";
import { createFileCalibrationReviewStore } from "../../calibration-review/file-store.js";
import type { CalibrationReviewDeps } from "../../calibration-review/router.js";
import { createMongoFlywheelStore } from "../../evaluation-flywheel/store.js";
import { createEvaluationFlywheel, type EvaluationFlywheel } from "../../evaluation-flywheel/workflow.js";
import { buildFlywheelAsk } from "../../evaluation-flywheel/ask.js";

export interface EvaluationIntegrations {
  championship?: ChampionshipStore;
  calibrationReview?: CalibrationReviewDeps;
  evaluationFlywheel?: EvaluationFlywheel;
}
export interface EvaluationIntegrationInput {
  db: Db; env: NodeJS.ProcessEnv; root: string; index: BoundIndexer; ask: AskRouteDeps;
  sourceIntake?: SourceIntakeDeps; routing: IntegrationRouting;
}
const localAbsolute = (value: string | undefined): value is string => typeof value === "string"
  && value === value.trim() && isAbsolute(value) && !/^(?:\\\\|\/\/)/.test(value) && !/[\u0000-\u001f\u007f]/.test(value);
const within = (parent: string, child: string): boolean => {
  const path = relative(resolve(parent), resolve(child));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
};
function championshipDatabaseAllowed(db: Db, env: NodeJS.ProcessEnv): boolean {
  const name = db.databaseName;
  if (!name || name !== name.trim() || /^global_university_db$/i.test(name)) return false;
  if (/^lkb$/i.test(name)) return name === "lkb" && env.MONGODB_DB === "lkb" && env.LKB_I_KNOW_THIS_IS_PRODUCTION === "1";
  return true;
}

/** Lazy real adapters only: no schema changes, writes, provider calls, or invented human evidence at construction. */
export function buildEvaluationIntegrations(input: EvaluationIntegrationInput): EvaluationIntegrations {
  const result: EvaluationIntegrations = {}, { env, db } = input;
  if (env.LKB_CHAMPIONSHIP === "1" && championshipDatabaseAllowed(db, env)) {
    // The store separately refuses writes until the canonical validator/unique trial migration exists.
    result.championship = createMongoChampionshipStore(db);
  }
  const storeRoot = env.CALIBRATION_REVIEW_STORE_DIR, corpusRoot = env.CALIBRATION_REVIEW_CORPUS_ROOT,
    packetPath = env.CALIBRATION_REVIEW_PACKET_PATH;
  const publicRoots = [resolve(input.root, "apps/web"), resolve(input.root, "public"), resolve(input.root, "dist/public")];
  if (localAbsolute(input.root) && localAbsolute(storeRoot) && localAbsolute(corpusRoot) && localAbsolute(packetPath)
      && !publicRoots.some(path => [storeRoot, corpusRoot, packetPath].some(value => within(path, value)))
      && !within(storeRoot, corpusRoot) && !within(storeRoot, packetPath)) {
    result.calibrationReview = { store: createFileCalibrationReviewStore({ root: storeRoot, projectRoot: corpusRoot, packetPath }) };
  }
  if (env.LKB_EVALUATION_FLYWHEEL === "1" && env.LKB_SOURCE_INTAKE === "1"
      && /^lkb_t059_[a-z0-9_-]+$/i.test(db.databaseName) && typeof input.sourceIntake?.intake === "function"
      && typeof input.index === "function" && typeof input.ask.requestDepsFor === "function") {
    const sourceIntake = input.sourceIntake;
    result.evaluationFlywheel = createEvaluationFlywheel({ store: createMongoFlywheelStore(db),
      intake: request => sourceIntake.intake(request), index: input.index, ask: buildFlywheelAsk(input.ask) });
  }
  // Missing or refused configuration stays undefined; authenticated routes must report unavailable, never use memory mocks.
  return result;
}
