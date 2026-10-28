import pathlib
p=pathlib.Path(__file__).with_name('native-next-gate.py');code=p.read_text(encoding='utf8')
code=code.replace("prefix='native-next-'","prefix='native-next-stage2-'").replace("combined-source-pins.json');assert len(packet)==51","combined-source-pins-stage2.json');assert len(packet)==63")
code=code.replace("pins=inventory();", "deleted=load('qa/coordination/resume-20261015/native-next-maker/deleted-source-paths-stage2.json');assert all(not (ROOT/p).exists() for p in deleted),'deleted path returned';pins=inventory();")
code=code.replace("OUT/'native-next-", "OUT/'native-next-stage2-")
old="{'extends':str(ROOT/'tsconfig.base.json'),'include':[str(ROOT/'scripts/native-capture/*.ts')],'compilerOptions':{'types':['node'],'typeRoots':[str(ROOT/'node_modules/@types')]}}"
new="{'extends':(ROOT/'tsconfig.base.json').as_posix(),'files':[p.as_posix() for p in sorted((ROOT/'scripts/native-capture').glob('*.ts'))],'compilerOptions':{'types':['node'],'typeRoots':[(ROOT/'node_modules/@types').as_posix()]}}"
assert old in code;code=code.replace(old,new)
# Generated is explicitly ignored by the configured structure checker. Retain exact LOC rows,
# but do not pass an ignored directory as an explicit traversal root.
code=code.replace("c.roots=dirs.filter(d=>!dirs.some(p=>p!==d&&d.startsWith(p+'/')))","c.roots=dirs.filter(d=>!d.split('/').some(x=>c.ignoreDirs.includes(x))&&!dirs.some(p=>p!==d&&d.startsWith(p+'/')))")
exec(compile(code,str(p),'exec'))
