$ErrorActionPreference = "Continue"
$T = Join-Path $env:TEMP ("triage-probe2-" + [guid]::NewGuid().ToString("N").Substring(0,8))
New-Item -ItemType Directory -Force -Path $T | Out-Null
function W([string]$p, [string]$s) { [System.IO.File]::WriteAllText($p, $s) }
# ISS-180 verbatim
$payload = (@{ tool_name = "Write"; tool_input = @{ file_path = "\\?\D:\KnowledgeBase\docs\DECISIONS.md"; content = "x" } } | ConvertTo-Json -Compress)
$o = $payload | powershell -NoProfile -File D:\ai_os\.claude\hooks\aios-write-guard.ps1
"ISS-180 extended-length -> " + ($(if ([string]::IsNullOrWhiteSpace(($o -join ""))) {"SILENT(allow)"} else { ($o -join "").Substring(0,[Math]::Min(200,($o -join "").Length)) }))

$KB = "D:\KnowledgeBase\.claude\hooks"
function Tree($n) { $d = Join-Path $T $n; New-Item -ItemType Directory -Force -Path "$d\qa\manifests","$d\qa\verdicts" | Out-Null; return $d }
# A035913-011: mc-precommit with canonical-only manifest
$d = Tree "pc"; W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 0 of max 3`n`n**Handshake status:** ready-for-check`n"
Push-Location $d
$o = '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' | powershell -NoProfile -File "$KB\mc-precommit.ps1"
"A035913-011 repo mc-precommit canonical-only -> [" + ($o -join "") + "]"
W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 0 of max 3`n`n**Status:** ready-for-check`n"
$o = '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' | powershell -NoProfile -File "$KB\mc-precommit.ps1"
"A035913-011 repo mc-precommit legacy ctrl   -> [" + ($o -join "") + "]"
Pop-Location
# mc-sessionstart repo-local: canonical-only pending, and ISS-267 FAIL at current cycle
$d = Tree "ss1"; W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 0 of max 3`n`n**Handshake status:** ready-for-check`n"
Push-Location $d; $o = powershell -NoProfile -File "$KB\mc-sessionstart.ps1"; Pop-Location
"SS canonical-only  -> " + (($o -join " ") -replace '\s+',' ').Substring(0,230)
$d = Tree "ss2"; W "$d\qa\manifests\u.md" "# M`n**Fix cycle:** 1 of max 3`n`n**Status:** ready-for-check`n"; W "$d\qa\verdicts\u.md" "# Verdict`n**Cycle checked:** 1`n**VERDICT: FAIL**`n"
Push-Location $d; $o = powershell -NoProfile -File "$KB\mc-sessionstart.ps1"; Pop-Location
"ISS-267 FAIL@cycle -> " + (($o -join " ") -replace '\s+',' ').Substring(0,230)
"temp=$T"
