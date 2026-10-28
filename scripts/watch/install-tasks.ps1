<#
  scripts/watch/install-tasks.ps1 - U6 / T-038 (consent: D-045; autojoin decision 2026-10-14).
  Installs the 5-minute poller that runs `lkb schedule-tick` (discovery -> select -> schedule one-off recorder tasks -> alerts)
  as ONE Windows Scheduled Task named lkb-autojoin-poller, run as the CURRENT interactive user.

  D-045 constraints, all enforced here:
    * DRY-RUN BY DEFAULT. Without -Apply this prints the task it WOULD register (name, trigger, command line, working
      directory, run-as account) and changes nothing on the machine.
    * IDEMPOTENT. Re-running converges: an existing lkb-autojoin-poller is updated in place, never duplicated; the result is
      reported as created / updated / unchanged.
    * REVERSIBLE. -Remove (preview) and -Remove -Apply unregister exactly the tasks whose name starts with `lkb-autojoin-`
      and touch nothing else in Task Scheduler. (Per-meeting `lkb-autorecord-*` one-off tasks belong to the tick, not to this script.)
    * NO CREDENTIALS. Runs as the current user, interactive logon, limited rights; never prompts for or stores a password;
      never registers a SYSTEM task.

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\watch\install-tasks.ps1                 # preview
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\watch\install-tasks.ps1 -Apply          # install / update
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\watch\install-tasks.ps1 -Remove -Apply  # uninstall
  Optional: -NodePath <node.exe> (default: node on PATH), -IntervalMinutes <1-59> (default 5).

  The poller needs the API host running (LKB_API_URL, default http://localhost:3300): `node --import tsx scripts/webinar/join-rules-api-host.ts --i-know-this-is-production`
  with MONGODB_URL and MONGODB_DB=lkb set (or MONGO_WORK_DB=<isolated db> instead of the flag); there is no localhost fallback. This script only registers the poller; it never starts the host.
#>
param(
  [switch]$Apply,
  [switch]$Remove,
  [string]$NodePath,
  [ValidateRange(1, 59)][int]$IntervalMinutes = 5
)
$ErrorActionPreference = "Stop"
$Prefix = "lkb-autojoin-"
$TaskName = "${Prefix}poller"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cli = Join-Path $repoRoot "packages\meeting-bot\src\cli.ts"
$logFile = Join-Path $repoRoot "raw\webinars\schedule-tick.log"
$runAs = "$env:USERDOMAIN\$env:USERNAME"

function Fail($m) { Write-Error $m; exit 1 }

if ($Remove) {
  $owned = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like "$Prefix*" })
  if (-not $owned.Count) { Write-Output "nothing to remove: no task named $Prefix* is registered"; exit 0 }
  foreach ($t in $owned) {
    if ($Apply) { Unregister-ScheduledTask -TaskName $t.TaskName -Confirm:$false; Write-Output "removed: $($t.TaskName)" }
    else { Write-Output "PREVIEW (nothing changed): would remove $($t.TaskName). Re-run with -Remove -Apply." }
  }
  exit 0
}

if (-not $NodePath) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { Fail "node.exe not found on PATH; pass -NodePath <full path to node.exe>" }
  $NodePath = $cmd.Source
}
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { Fail "-NodePath '$NodePath' is not a file" }
if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) { Fail "meeting-bot CLI not found at $cli" }
# The values below are placed inside a PowerShell command string; refuse anything that could break out of single quotes.
foreach ($p in @($NodePath, $cli, $logFile)) { if ($p -match "['""`r`n]") { Fail "refusing a path containing quote or newline characters: $p" } }

# Never launched through pnpm or a .cmd shim (ISS-323): node.exe directly, output appended to a log file, no visible window.
$inner = "& '$NodePath' --import tsx '$cli' schedule-tick *>> '$logFile'"
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"$inner`""
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

Write-Output "task:              $TaskName"
Write-Output "trigger:           every $IntervalMinutes minute(s), starting 1 minute after registration, repeating for 10 years"
Write-Output "command:           powershell.exe $arguments"
Write-Output "working directory: $repoRoot"
Write-Output "run as:            $runAs (current interactive user, limited rights, no password stored)"
Write-Output "overlap:           a tick still running when the next fires is skipped (IgnoreNew); 4 minute limit per tick"

if (-not $Apply) {
  $state = if ($existing) { "an existing $TaskName would be updated in place" } else { "$TaskName would be created" }
  Write-Output "PREVIEW (nothing changed): $state. Re-run with -Apply to install."
  exit 0
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$principal = New-ScheduledTaskPrincipal -UserId $runAs -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$unchanged = $false
if ($existing) {
  $a = $existing.Actions | Select-Object -First 1
  $unchanged = ($a.Execute -eq "powershell.exe") -and ($a.Arguments -eq $arguments) -and ($a.WorkingDirectory -eq $repoRoot) -and
    (($existing.Triggers | Select-Object -First 1).Repetition.Interval -eq "PT${IntervalMinutes}M")
}
if ($unchanged) { Write-Output "unchanged: $TaskName already matches"; exit 0 }
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "LKB autojoin poller: lkb schedule-tick every $IntervalMinutes min (D-045; remove with install-tasks.ps1 -Remove -Apply)" -Force | Out-Null
Write-Output $(if ($existing) { "updated: $TaskName" } else { "created: $TaskName" })
