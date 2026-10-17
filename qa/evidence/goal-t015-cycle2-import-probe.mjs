/** Current shared-module import compatibility only; no loader admission/export/trainer invocation. */
import assert from 'node:assert/strict';
import * as prepare from '../../scripts/training/prepare.mjs';
import * as validate from '../../scripts/training/validate.mjs';
import * as exporter from '../../scripts/training/export.mjs';
import * as trainer from '../../scripts/training/train.mjs';
import * as privacy from '../../scripts/lib/transcription/private-recording.mjs';
for (const value of [prepare.prepareTrainingPlan, validate.validateTrainingPlan,
  exporter.exportTrainingDataset, exporter.validateTrainingExport, trainer.runPrivateTraining,
  privacy.verifyTrustedRecordingPrivacyAdmission]) assert.equal(typeof value, 'function');
console.log(JSON.stringify({status:'current-import-interface-ready', importedInterfaces:6,
  admissionExecuted:false, exported:false, trained:false, evaluated:false, promoted:false}));
