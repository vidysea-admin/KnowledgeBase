import pathlib
p=pathlib.Path(__file__).with_name('native-next-stage3-focused.py');code=p.read_text(encoding='utf8')
code=code.replace('native-next-stage3-gate-summary.json','native-next-stage3-repair1-gate-summary.json').replace('native-next-stage3-inventory-after.json','native-next-stage3-repair1-inventory-after.json')
code=code.replace("'native-next-stage3-'+label","'native-next-stage3-repair1-'+label").replace("'native-next-stage3-acl-cleanup'","'native-next-stage3-repair1-acl-cleanup'").replace('native-next-stage3-final-sealed-inventory.json','native-next-stage3-repair1-final-sealed-inventory.json').replace('native-next-stage3-focused-summary.json','native-next-stage3-repair1-focused-summary.json')
exec(compile(code,str(p),'exec'))
