from broker_lib import *
config=OUT/'native-next-tsconfig.json';old=config.read_bytes();(OUT/'native-next-tsconfig-original.json').write_bytes(old)
sources=sorted((ROOT/'scripts/native-capture').glob('*.ts'))
config.write_text(json.dumps({'extends':(ROOT/'tsconfig.base.json').as_posix(),'files':[p.as_posix() for p in sources],'compilerOptions':{'types':['node'],'typeRoots':[(ROOT/'node_modules/@types').as_posix()]}}))
pins=load('qa/coordination/resume-20261015/broker/native-next-inventory-before.json')
r=run('native-next-root-script-types-repaired-config',[NODE,'node_modules/typescript/bin/tsc','--noEmit','-p',str(config)],ROOT,70,pins)
(OUT/'native-next-root-script-config-admission.json').write_text(json.dumps({'originalConfigSha256':__import__('hashlib').sha256(old).hexdigest(),'repairedConfigSha256':sha(config),'repair':'broker-only Windows backslash glob normalization replaced with exact six files; no compiler setting weakened','files':[p.relative_to(ROOT).as_posix() for p in sources],'result':r},indent=2))
