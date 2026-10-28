$ErrorActionPreference = "Continue"
$H = "D:\ai_os\.claude\hooks"
$T = Join-Path $env:TEMP ("triage-probe-" + [guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Force -Path $T | Out-Null
$env:CLAUDE_DELIVERY_GATE_GLOBAL_FILES = (Join-Path $T "never.md")
$bt = [string][char]0x60
$tr = Join-Path $T "tr.jsonl"
@('{"type":"user","message":{"role":"user","content":"go"}}','{"type":"assistant","message":{"content":[{"type":"tool_use","id":"ng1","name":"Read","input":{"file_path":"D:/x/a.md"}}]}}') | Set-Content -Path $tr -Encoding utf8
function Proj([string]$n) { $d = Join-Path $T $n; New-Item -ItemType Directory -Force -Path (Join-Path $d "qa\manifests"),(Join-Path $d "qa\verdicts") | Out-Null; Set-Content (Join-Path $d "qa\feedback-inbox.md") "touched"; return $d }
function Stop([string]$dir) { $in = @{ session_id = "tp-$(Get-Random)"; transcript_path = $tr; cwd = $dir; stop_hook_active = $false } | ConvertTo-Json -Compress; $out = $in | powershell -NoProfile -File "$H\delivery-gate-stop.ps1"; return ($out -join "") }
function Show([string]$tag, [string]$o) { $m = [regex]::Match($o, '\d+ check\(s\) pending[^"]{0,120}'); $cap = $o -match 'D-014 round cap'; "{0,-34} blocked={1} cap={2} :: {3}" -f $tag, ($o -match '"decision":"block"'), $cap, $m.Value }
function W([string]$p, [string]$s) { [System.IO.File]::WriteAllText($p, $s) }

# A035913-001: canonical-only Handshake status
$d = Proj "a001"; W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 0 of max 3`n`n**Handshake status:** ready-for-check`n"
Show "A035913-001 canonical-only" (Stop $d)
$d = Proj "a001b"; W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 0 of max 3`n`n**Status:** ready-for-check`n"
Show "A035913-001 control legacy" (Stop $d)

# A035913-003: prose seam candidate, 2 prior PASS with backticked seam
$passV = "# Verdict`n**Cycle checked:** 0`n**VERDICT: PASS**`n"
function Prior($d, $n) { W "$d\qa\manifests\$n.md" "# M $n`n**Fix cycle:** 0 of max 3`n`n## What changed`n- ${bt}src/a/target.ts${bt} edited`n`n**Status:** checked-PASS`n"; W "$d\qa\verdicts\$n.md" $passV }
$d = Proj "a003"; Prior $d "p1"; Prior $d "p2"
W "$d\qa\manifests\cand.md" "# M cand`n**Fix cycle:** 0 of max 3`n`n## What changed`n- the vector target file under src/a (target.ts) was edited`n`n**Status:** ready-for-check`n"
Show "A035913-003 prose seam" (Stop $d)
$d = Proj "a003b"; Prior $d "p1"; Prior $d "p2"
W "$d\qa\manifests\cand.md" "# M cand`n**Fix cycle:** 0 of max 3`n`n## What changed`n- ${bt}src/a/target.ts${bt} edited`n`n**Status:** ready-for-check`n"
Show "A035913-003 control backticked" (Stop $d)

# ISS-184: bullet form and heading form of Cycle checked; manifest cycle 1/3
$d = Proj "i184a"; W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 1 of max 3`n`n**Status:** ready-for-check`n"
W "$d\qa\verdicts\u.md" "# Verdict`n- **Cycle checked:** 1`n- **VERDICT: PASS**`n"
Show "ISS-184 bullet (expect 0 pending)" (Stop $d)
$d = Proj "i184b"; W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 3 of max 3`n`n**Status:** ready-for-check`n"
W "$d\qa\verdicts\u.md" "# Verdict - u . **Cycle checked: 3**`n`n**VERDICT: FAIL**`n"
Show "ISS-184 heading (expect 0 pending)" (Stop $d)

# ISS-205 (a)(b)(c): manifest cycle 2; only stamp is 1 -> must stay PENDING
$d = Proj "i205"; W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 2 of max 3`n`n**Status:** ready-for-check`n"
W "$d\qa\verdicts\u.md" ("# Verdict`nCycle checked: ${bt}x${bt}9 lines below.`n**VERDICT: PASS**`n")
Show "ISS-205(a) expect pending" (Stop $d)
W "$d\qa\verdicts\u.md" "# Verdict`nCycle checked:`n`n9 issues were written.`n**VERDICT: PASS**`n"
Show "ISS-205(b) expect pending" (Stop $d)
W "$d\qa\verdicts\u.md" ("# Verdict`nCycle checked: ${bt}N${bt}`n3 criteria met.`n**VERDICT: PASS**`n")
Show "ISS-205(c) expect pending" (Stop $d)
# ISS-227
W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 3 of max 3`n`n**Status:** ready-for-check`n"
W "$d\qa\verdicts\u.md" ("# Verdict`nCycle checked: ${bt}1${bt} 9/9 criteria met`n**VERDICT: PASS**`n")
Show "ISS-227 expect pending" (Stop $d)
# ISS-228: Fix cycle value in code span, next line starts with 1; only verdict cycle 1
W "$d\qa\manifests\u.md" ("# M`nFix cycle: ${bt}3${bt}`n1 file changed`n`n**Status:** ready-for-check`n")
W "$d\qa\verdicts\u.md" "# Verdict`n**Cycle checked:** 1`n**VERDICT: PASS**`n"
Show "ISS-228 expect pending" (Stop $d)
"temp=$T"
