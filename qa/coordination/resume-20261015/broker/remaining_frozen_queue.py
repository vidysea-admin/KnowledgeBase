import pathlib
driver=pathlib.Path(__file__).with_name('finite_native_queue.py')
prefix=driver.read_text(encoding='utf-8').split("\np=root/'qa/coordination/resume-20261015/native-codecledger/broker-request.json'")[0]
prefix=prefix.replace("'qa/coordination/resume-20261015/native-current-writers.json'","'qa/coordination/resume-20261015/native-active-writers-current.json'")
prefix=prefix.replace("leases=load(leasepath);active=", "leases=load(leasepath);leases['sharedTypesSha256']='022057b6a629eec111c3bafc4d9fefe39119da55ee87a7f1f2eba7c3ee7f1b77';active=")
prefix=prefix.replace("'finite-native-summary.json'","'remaining-frozen-summary.json'").replace("'finite-native-preflight.log'","'remaining-frozen-preflight.log'")
prefix=prefix.replace("  expected={p:v.lower() for p,v in pins.items()};", "  active={p for lane in load(leasepath)['activeWriters'] for p in lane['paths']};expected={p:v.lower() for p,v in pins.items()};")
exec(compile(prefix,str(driver),'exec'))
bins=load('qa/coordination/resume-20261015/broker/native-binaries.json');b={j['Name']:j['Source'] for j in bins};assert all(pathlib.Path(v).is_file() and pathlib.Path(v).is_absolute() for v in b.values())
known=load('qa/coordination/resume-20261015/broker/native-binary-hashes.json');assert all(sha(v)==known[k]['sha256'] for k,v in b.items()),'same binaries required'
benv={'LKB_NATIVE_TEST_FFMPEG':b['ffmpeg.exe'],'LKB_NATIVE_TEST_FFPROBE':b['ffprobe.exe']}
codec=pins_from(load('qa/coordination/resume-20261015/native-codecledger/candidate-pins.json'))
fix=load('qa/coordination/resume-20261015/native-finalizer-maker/fix-1/checkpoint.json');finalpins=pins_from(fix['files']);finalpins.update(codec)
p=root/'qa/coordination/resume-20261015/native-finalizer-maker/fix-1/packet.md'
run('native-finalizer-fix1',['--test','--import','tsx','src/capture/native-media-probe.test.ts','src/capture/native-media-finalize.test.ts'],root/'packages/meeting-bot',finalpins,65,p,envextra=benv)
p=root/'qa/coordination/resume-20261015/native-privacy-audio-maker/packet.md';r=load('qa/coordination/resume-20261015/native-privacy-audio-maker/checkpoint.json');privacy=pins_from(r['sources']);privacy.update(finalpins)
for name in ['provider-input.test.ts','finalizer-input.test.ts']:
 rel='packages/meeting-bot/src/capture/record-consent/'+name;privacy[rel]=sha(root/rel)
run('native-privacy-audio',['--test','--import','tsx','src/capture/record-consent/native-provider-audio.test.ts','src/capture/record-consent/provider-input.test.ts','src/capture/record-consent/finalizer-input.test.ts'],root/'packages/meeting-bot',privacy,75,p,envextra=benv)
p=root/'qa/coordination/resume-20261015/native-measurement/broker-request.json';r=load('qa/coordination/resume-20261015/native-measurement/packet.json');old=load('qa/coordination/resume-20261015/native-measurement/pins.json');measurement={n:old[n] for n in r['owned_paths']};measurement.update(finalpins)
(out/'measurement-combined-pin-adoption.json').write_text(json.dumps({'authority':'root latest frozen finalizer fix1; exact combined dependency binding','old_probe_sha256':old['packages/meeting-bot/src/capture/native-media-probe.ts'],'new_probe_sha256':finalpins['packages/meeting-bot/src/capture/native-media-probe.ts'],'fix_checkpoint_sha256':sha(root/'qa/coordination/resume-20261015/native-finalizer-maker/fix-1/checkpoint.json'),'omitted_sampler':'active sb_join_tiles.py producer dependency; no sampler/Python test run'},indent=2))
run('native-measurement-registry',['--test','--import','tsx','--test-concurrency=1','--test-timeout=30000','src/capture/tiles/native-measurement.test.ts','src/capture/tiles/registry.test.ts'],root/'packages/meeting-bot',measurement,60,p)
p=root/'qa/coordination/resume-20261015/eval-pilot/diagnostics-cycle1/repair1/broker-request.json';r=load(p);run('eval-diagnostics-repair1',r['command'][1:],root,pins_from(r['pins']),r['outerTimeoutSeconds'],p)
