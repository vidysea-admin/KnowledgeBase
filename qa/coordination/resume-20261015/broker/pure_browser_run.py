import pathlib
driver=pathlib.Path(__file__).with_name('finite_native_queue.py')
prefix=driver.read_text(encoding='utf-8').split("\np=root/'qa/coordination/resume-20261015/native-codecledger/broker-request.json'")[0]
prefix=prefix.replace("'finite-native-summary.json'","'browser-pure-summary.json'").replace("'finite-native-preflight.log'","'browser-pure-preflight.log'")
exec(compile(prefix,str(driver),'exec'))
p=root/'qa/coordination/resume-20261015/native-producer-design/browserproducer-component.json';r=load(p)
selected=[j for j in r['files'] if pathlib.PurePosixPath(j['path']).name.startswith(('native-video.','native-audio-worklet.','native-recorder.'))]
pins=pins_from(selected)
run('browserproducer-pure-seven',['--test','py/tab-capture/native-video.test.mjs','py/tab-capture/native-audio-worklet.test.mjs','py/tab-capture/native-recorder.test.mjs'],root/'packages/meeting-bot',pins,35,p)
