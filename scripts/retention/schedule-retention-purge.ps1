#Requires -Version 7.0
# T-046 / D-145: schedules the raw-media purge (media older than 90 days; transcripts kept forever).
# Same mechanism as start-calendar-attendance.ps1: a pwsh launcher plus a Windows Scheduled Task (daily).
# DRY RUN by default. Deleting needs BOTH -Execute and -ConfirmDeletion, at run time and at install time.
# Ruling 5 (2026-10-17, Umesh): -MinAgeDays defaults to 90 and is floored at 90; -ClipPaddingSeconds defaults to 15 and is floored at 15.
[CmdletBinding()]
param(
    [switch]$Run,
    [switch]$TaskPreview,
    [switch]$InstallTask,
    [switch]$Execute,
    [switch]$ConfirmDeletion,
    [string]$Tenant,
    [string]$DataRoot,
    [string]$MediaRoot,
    [string]$OperationsState,
    [string]$MinAgeDays = '90',
    [string]$ClipPaddingSeconds = '15',
    [string]$ReportFile,
    [string]$DailyAt = '03:30',
    [string]$NodePath = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.1002.7124.0_x64__2p2nqsd0c76g0\app\resources\cua_node\bin\node.exe'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$launcherPath = $PSCommandPath
$cliPath = Join-Path $projectRoot 'packages/ingest/src/retention/retention-purge-job-cli.ts'
$taskName = 'Vidysea-Retention-Purge'
if (-not $OperationsState) { $OperationsState = Join-Path $projectRoot 'data/webinar-release/operations.json' }
if (-not $ReportFile) { $ReportFile = Join-Path $projectRoot 'data/retention/report.json' }

function Assert-AbsolutePath([string]$Value) {
    if ($Value -notmatch '^[A-Za-z]:[\\/]' -or $Value -match '[\x00-\x1f\x7f"%]' -or $Value.Contains('..')) {
        throw 'An absolute local path without controls, quotes, expansion or parent segments is required.'
    }
}
function Assert-Token([string]$Name, [string]$Value, [string]$Pattern) {
    if (-not $Value -or $Value -notmatch $Pattern) { throw "-$Name has an invalid value." }
}
if ($Execute -and -not $ConfirmDeletion) { throw '-Execute needs -ConfirmDeletion. Without both this job is a dry run.' }
if (($Run -or $InstallTask) -and $TaskPreview) { throw 'TaskPreview cannot run or install.' }
if ($DailyAt -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { throw '-DailyAt must be HH:mm.' }
foreach ($value in @($projectRoot, $NodePath, $OperationsState, $ReportFile)) { Assert-AbsolutePath $value }
foreach ($value in @($DataRoot, $MediaRoot)) { if ($value) { Assert-AbsolutePath $value } }

function Assert-Floor([string]$Name, [string]$Value, [double]$Floor) {
    if ([double]::Parse($Value, [Globalization.CultureInfo]::InvariantCulture) -lt $Floor) { throw "-$Name must be at least $Floor (ruling 5 floor)." }
}
function Get-JobArguments {
    foreach ($p in @(@('Tenant', $Tenant, '^[A-Za-z0-9._-]{1,64}$'), @('MinAgeDays', $MinAgeDays, '^\d{1,5}(\.\d{1,3})?$'),
            @('ClipPaddingSeconds', $ClipPaddingSeconds, '^\d{1,4}(\.\d{1,3})?$'))) { Assert-Token $p[0] $p[1] $p[2] }
    Assert-Floor 'MinAgeDays' $MinAgeDays 90
    Assert-Floor 'ClipPaddingSeconds' $ClipPaddingSeconds 15
    foreach ($p in @(@('DataRoot', $DataRoot), @('MediaRoot', $MediaRoot))) { if (-not $p[1]) { throw "-$($p[0]) is required." } }
    $jobArgs = @('--import', 'tsx', $cliPath, '--tenant', $Tenant, '--data-root', $DataRoot, '--media-root', $MediaRoot,
        '--min-age-days', $MinAgeDays, '--clip-padding-seconds', $ClipPaddingSeconds,
        '--operations-state', $OperationsState, '--report-file', $ReportFile)
    if ($Execute) { $jobArgs += @('--execute', '--confirm-deletion') }
    return $jobArgs
}

function New-PurgeTaskDefinition {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $shell = [Environment]::ProcessPath
    Assert-AbsolutePath $shell
    $parts = @('-NoProfile', '-File', ('"' + $launcherPath + '"'), '-Run', '-NodePath', ('"' + $NodePath + '"'),
        '-Tenant', $Tenant, '-DataRoot', ('"' + $DataRoot + '"'), '-MediaRoot', ('"' + $MediaRoot + '"'),
        '-MinAgeDays', $MinAgeDays, '-ClipPaddingSeconds', $ClipPaddingSeconds,
        '-OperationsState', ('"' + $OperationsState + '"'), '-ReportFile', ('"' + $ReportFile + '"'))
    if ($Execute) { $parts += @('-Execute', '-ConfirmDeletion') }
    $action = New-ScheduledTaskAction -Execute $shell -Argument ($parts -join ' ') -WorkingDirectory $projectRoot -ErrorAction Stop
    $principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited -ErrorAction Stop
    $trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt -ErrorAction Stop
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::FromHours(2)) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ErrorAction Stop
    return New-ScheduledTask -Action $action -Principal $principal -Trigger $trigger -Settings $settings -ErrorAction Stop
}
function Register-OwnedPurgeTask($Definition) {
    $existing = @(Get-ScheduledTask -TaskPath '\' -ErrorAction Stop | Where-Object TaskName -eq $taskName)
    if ($existing.Count -gt 1) { throw 'Ambiguous task ownership; no task was updated.' }
    if ($existing.Count -eq 1) {
        $owned = $existing[0]
        if ($owned.Principal.UserId -ne $Definition.Principal.UserId -or @($owned.Actions).Count -ne 1 -or
            $owned.Actions[0].WorkingDirectory -ne $projectRoot -or
            -not $owned.Actions[0].Arguments.StartsWith(('-NoProfile -File "' + $launcherPath + '" -Run '), [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Existing task is not owned by this operator and launcher; no task was updated.'
        }
        $null = Set-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $Definition.Actions `
            -Trigger $Definition.Triggers -Settings $Definition.Settings -Principal $Definition.Principal -ErrorAction Stop
        return 'updated'
    }
    $null = Register-ScheduledTask -TaskName $taskName -TaskPath '\' -InputObject $Definition -ErrorAction Stop
    return 'registered'
}

if ($TaskPreview) {
    $null = Get-JobArguments
    $task = New-PurgeTaskDefinition
    [ordered]@{mode='task-preview';registered=$false;taskName=$taskName;deletes=[bool]$Execute;dailyAt=$DailyAt;
        action=[ordered]@{execute=$task.Actions[0].Execute;arguments=$task.Actions[0].Arguments;workingDirectory=$task.Actions[0].WorkingDirectory};
        trigger=[ordered]@{type=$task.Triggers[0].CimClass.CimClassName}} | ConvertTo-Json -Depth 5
    return
}
if (-not $Run -and -not $InstallTask) {
    [ordered]@{mode='preview';deletes=[bool]$Execute;executable=$NodePath;workingDirectory=$projectRoot;cli=$cliPath;
        reportFile=$ReportFile;operationsState=$OperationsState;taskName=$taskName;taskRegistered=$false;
        note='Dry run by default. Pass -Run to run once, -InstallTask to register the daily task. Deleting needs -Execute -ConfirmDeletion.'} | ConvertTo-Json -Depth 4
    return
}
if (-not $IsWindows) { throw 'Run/install requires Windows.' }
$jobArgs = Get-JobArguments
if ($InstallTask) {
    $disposition = Register-OwnedPurgeTask (New-PurgeTaskDefinition)
    [ordered]@{mode='installed';taskName=$taskName;disposition=$disposition;deletes=[bool]$Execute;dailyAt=$DailyAt} | ConvertTo-Json
    return
}
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'The node executable is missing; nothing ran.' }
Push-Location -LiteralPath $projectRoot
try {
    & $NodePath @jobArgs
    $exitCode = $LASTEXITCODE
} finally { Pop-Location }
if ($exitCode -ne 0) { throw "Retention purge job exited with code $exitCode; see $ReportFile." }
