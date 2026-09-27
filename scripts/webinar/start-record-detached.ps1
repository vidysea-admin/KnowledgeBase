<#
  scripts/webinar/start-record-detached.ps1 — T-047. Launches the meeting-bot CLI (`node --import
  tsx packages/meeting-bot/src/cli.ts record ...`, never via a pnpm/.cmd shim — ISS-323) fully detached from the calling console/window, so closing that console can
  never kill the recording again — the 2026-09-24 16:30:56 failure (console closed → Ctrl+C exit
  0xC000013A → OBS + bot Chrome kept going with nothing to finalize them) this script closes.
  Output goes to a timestamped log file under raw/webinars/, never to a visible window, via
  Start-Process -WindowStyle Hidden. This is the launcher the Task Scheduler .cmd calls.

  Usage (direct, one line):
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\webinar\start-record-detached.ps1 `
      -Url <url> -Until HH:MM [-Title T] [-SessionId ID] [-EndNotBefore HH:MM] [-ExtraArgs "--transcribe"]

  Usage (U5 auto-record, fix cycle 2 / ISS-317): a Windows Scheduled Task built by
  task-scheduler.ts's scheduleOnce calls this script as -Job <jobKey> instead — a validated
  [a-z0-9-]{1,64} key, never raw title/url/sessionId text (those never reach the Task Scheduler
  command line at all any more). This mode reads raw\webinars\scheduled\<jobKey>.json (written
  by schedule-tick.ts's writeScheduledJob) for -Url/-Until/-Title/-SessionId, then falls straight
  into the same code path below as a direct invocation. Any -Url/-Until/etc. passed alongside
  -Job take precedence over the job file (so direct testing/overrides still work).

  Recovery if this machine's watchdog task also died: `pnpm --filter @lkb/meeting-bot cli watchdog`
  is idempotent and safe to run by hand any time — it no-ops when nothing is recording.
#>
param(
  [string]$Url,
  [string]$Until,
  [string]$Title,
  [string]$SessionId,
  [string]$EndNotBefore,
  [string]$ExtraArgs = "",
  # ISS-317 fix (cycle 2): the ONLY value a Task Scheduler-launched run passes. Validated below
  # against the same [a-z0-9-]{1,64} shape task-scheduler.ts's JOB_KEY_RE enforces on the maker
  # side — belt-and-suspenders, since this script trusts nothing about how it was invoked.
  [string]$Job,
  # ISS-323 test seam: the entry script node runs. Defaults to the real CLI; the regression test
  # points it at a fixture that dumps its argv, so argv fidelity is checked without a recording.
  [string]$CliEntry,
  # ISS-323: how long to watch the child before declaring the launch good. 0 skips the wait.
  [int]$LivenessSeconds = 5
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logDir = Join-Path $repoRoot "raw\webinars"

if ($Job) {
  if ($Job -notmatch '^[a-z0-9-]{1,64}$') {
    Write-Error "invalid -Job '$Job' (must match ^[a-z0-9-]{1,64}$) - refusing to read a job file"
    exit 1
  }
  $jobFile = Join-Path $logDir "scheduled\$Job.json"
  if (-not (Test-Path $jobFile)) {
    Write-Error "no job file found for -Job '$Job' at $jobFile"
    exit 1
  }
  $jobData = Get-Content -Raw -Path $jobFile | ConvertFrom-Json
  if (-not $Url) { $Url = $jobData.url }
  if (-not $Until) { $Until = $jobData.until }
  if (-not $Title) { $Title = $jobData.title }
  if (-not $SessionId) { $SessionId = $jobData.sessionId }
}

if (-not $Url -or -not $Until) {
  $usage = "usage: -Url <url> -Until <HH:MM|ISO datetime> [-Title T] [-SessionId ID] " +
    "[-EndNotBefore HH:MM] [-ExtraArgs '...'], OR -Job <jobKey> reading raw\webinars\scheduled\<jobKey>.json"
  Write-Error $usage
  exit 1
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$log = Join-Path $logDir "record-$stamp.log"
$errLog = Join-Path $logDir "record-$stamp.err.log"

# ISS-323: never launch through pnpm. On this machine `Start-Process -FilePath "pnpm"` resolved the
# pnpm *sh* shim ("%1 is not a valid Win32 application"), produced an empty pid, and still exited 0;
# and any .cmd shim re-parses argv through cmd.exe, where an unquoted `&` in a Zoom join URL splits
# the command ("uuid is not recognized"). node.exe is a real PE and takes argv verbatim.
$node = (Get-Command node -ErrorAction Stop).Source
if ($CliEntry) { $entry = $CliEntry } else { $entry = Join-Path $repoRoot "packages\meeting-bot\src\cli.ts" }

$cliArgs = @("--import", "tsx", $entry, "record", $Url, "--until", $Until)
if ($Title) { $cliArgs += @("--title", $Title) }
if ($SessionId) { $cliArgs += @("--session-id", $SessionId) }
if ($EndNotBefore) { $cliArgs += @("--end-not-before", $EndNotBefore) }
if ($ExtraArgs) { $cliArgs += ($ExtraArgs -split ' ' | Where-Object { $_ -ne "" }) }

# Quote every argument so neither PowerShell's argument joining nor any downstream re-parse can
# split a URL on `&` or a title on spaces.
$quoted = $cliArgs | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }

$proc = Start-Process -FilePath $node -ArgumentList $quoted -WorkingDirectory $repoRoot `
  -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errLog -PassThru

# ISS-323: fail LOUDLY. The old script printed "started detached record: pid " with an empty pid and
# exited 0 when the launch had not happened at all, so nothing upstream ever retried.
if ($null -eq $proc -or -not $proc.Id) {
  Write-Error "launch FAILED: Start-Process returned no process for '$node' - nothing is recording. See $errLog"
  exit 1
}
if ($LivenessSeconds -gt 0) {
  $null = $proc.WaitForExit($LivenessSeconds * 1000)
  if ($proc.HasExited) {
    Write-Error ("launch FAILED: recorder (pid {0}) exited within {1}s with code {2} - nothing is recording." -f $proc.Id, $LivenessSeconds, $proc.ExitCode)
    foreach ($f in @($errLog, $log)) {
      if ((Test-Path $f) -and (Get-Item $f).Length -gt 0) {
        Write-Output "--- tail $f ---"
        Get-Content -Path $f -Tail 20
      }
    }
    exit 1
  }
}

Write-Output "started detached record: pid $($proc.Id)"
Write-Output "stdout log: $log"
Write-Output "stderr log: $errLog"
