<#
  scripts/webinar/start-record-detached.ps1 — T-047. Launches `pnpm --filter @lkb/meeting-bot
  cli record ...` fully detached from the calling console/window, so closing that console can
  never kill the recording again — the 2026-09-24 16:30:56 failure (console closed → Ctrl+C exit
  0xC000013A → OBS + bot Chrome kept going with nothing to finalize them) this script closes.
  Output goes to a timestamped log file under raw/webinars/, never to a visible window, via
  Start-Process -WindowStyle Hidden. This is the launcher the Task Scheduler .cmd calls.

  Usage (one line):
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\webinar\start-record-detached.ps1 `
      -Url <url> -Until HH:MM [-Title T] [-SessionId ID] [-EndNotBefore HH:MM] [-ExtraArgs "--transcribe"]

  Recovery if this machine's watchdog task also died: `pnpm --filter @lkb/meeting-bot cli watchdog`
  is idempotent and safe to run by hand any time — it no-ops when nothing is recording.
#>
param(
  [Parameter(Mandatory = $true)][string]$Url,
  [Parameter(Mandatory = $true)][string]$Until,
  [string]$Title,
  [string]$SessionId,
  [string]$EndNotBefore,
  [string]$ExtraArgs = ""
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logDir = Join-Path $repoRoot "raw\webinars"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$log = Join-Path $logDir "record-$stamp.log"
$errLog = Join-Path $logDir "record-$stamp.err.log"

$cliArgs = @("--filter", "@lkb/meeting-bot", "cli", "record", $Url, "--until", $Until)
if ($Title) { $cliArgs += @("--title", $Title) }
if ($SessionId) { $cliArgs += @("--session-id", $SessionId) }
if ($EndNotBefore) { $cliArgs += @("--end-not-before", $EndNotBefore) }
if ($ExtraArgs) { $cliArgs += ($ExtraArgs -split ' ' | Where-Object { $_ -ne "" }) }

$proc = Start-Process -FilePath "pnpm" -ArgumentList $cliArgs -WorkingDirectory $repoRoot `
  -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errLog -PassThru

Write-Output "started detached record: pid $($proc.Id)"
Write-Output "stdout log: $log"
Write-Output "stderr log: $errLog"
