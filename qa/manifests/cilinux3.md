# cilinux3: inject platform into the OBS Windows-only gate

Status: checked-PASS
Fix cycle: 0
Lane: cilinux3 (lane/cilinux3), commit 066875c7. Repairs 2 Linux CI failures in packages/meeting-bot/src/lean-video-obs.test.ts.
Change: recordingBackend/runRecord take an injectable `platform` (default process.platform); tests inject win32; record-backend.test.ts asserts linux/darwin rejected; 4 start-record-detached tests skip off win32.
Verdict: qa/verdicts/cilinux3.md
