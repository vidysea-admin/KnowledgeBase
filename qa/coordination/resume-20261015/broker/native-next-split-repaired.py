import pathlib
p=pathlib.Path(__file__).with_name('native-next-split-replay.py');code=p.read_text(encoding='utf8')
code=code.replace('native-next-split-','native-next-split-repaired-')
code=code.replace("LKB_NATIVE_TEST_BROWSER=str(browser)","LKB_NATIVE_TEST_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'")
code=code.replace("remaining=285-(time.monotonic()-phase)","remaining=285-4.344-(time.monotonic()-phase)").replace("if 300-(time.monotonic()-phase)>=140:","if 300-4.344-(time.monotonic()-phase)>=140:")
old="reconciliation.append({'original':original,'current':matches.pop(0) if matches else None,'incompleteReason':None if matches else 'no matching current terminal title'})"
new="match=matches.pop(0) if matches else None;reconciliation.append({'original':original,'current':match,'incompleteReason':None if match is not None else 'no matching current terminal title'})"
assert old in code;code=code.replace(old,new)
code=code.replace("'elapsed_s':time.monotonic()-phase,'currentFloorTerminalResults'","'elapsed_s':time.monotonic()-phase,'priorSetupFailure_s':4.344,'totalIncludingPriorSetup_s':4.344+time.monotonic()-phase,'currentFloorTerminalResults'")
exec(compile(code,str(p),'exec'))
