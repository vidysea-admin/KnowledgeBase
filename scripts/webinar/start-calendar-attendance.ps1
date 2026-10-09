#Requires -Version 7.0
[CmdletBinding()]
param(
    [switch]$Run,
    [switch]$Watch,
    [switch]$TaskPreview,
    [switch]$InstallTask,
    [switch]$InteractiveSessionConfirmed,
    [switch]$CaptureCapacityConfirmed,
    [string]$NodePath = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.1002.7124.0_x64__2p2nqsd0c76g0\app\resources\cua_node\bin\node.exe',
    [string]$PythonPath,
    [string]$GwsPath,
    [string]$MediaDirectory
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$launcherPath = $PSCommandPath
$runnerPath = Join-Path $projectRoot 'scripts/webinar/run-pipeline.mjs'
$account = 'umeshsugara@vidysea.com'
if (-not $PythonPath) { $PythonPath = Join-Path $projectRoot '.venv/Scripts/python.exe' }
if (-not $GwsPath) { $GwsPath = Join-Path $projectRoot '.cache/tools/gws-0.22.5/gws.exe' }
if (-not $MediaDirectory) { $MediaDirectory = Join-Path $projectRoot '.cache/tools/ffmpeg-9.0.2/bin' }

function Assert-AbsolutePath([string]$Value) {
    if ($Value -notmatch '^[A-Za-z]:[\\/]' -or $Value -match '[\x00-\x1f\x7f"%]' -or $Value.Contains('..')) {
        throw 'An absolute local executable/directory path without controls, quotes or expansion is required.'
    }
}
foreach ($value in @($projectRoot, $NodePath, $PythonPath, $GwsPath, $MediaDirectory)) { Assert-AbsolutePath $value }
$runnerArgs = @($runnerPath, '--calendar-attendance-account', $account)
if ($Run) { $runnerArgs += '--run' }
if ($Watch) { $runnerArgs += '--watch' }
if (($Run -or $InstallTask) -and $TaskPreview) { throw 'TaskPreview cannot activate capture or install a task.' }

function Invoke-ReadinessCommand([string]$Executable, [string[]]$Arguments) {
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $Executable
    $start.WorkingDirectory = $projectRoot
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { throw 'A readiness subprocess could not start.' }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(60000)) {
            $process.Kill($true)
            if (-not $process.WaitForExit(5000)) { throw 'Owned readiness subprocess cleanup failed.' }
            throw 'A readiness subprocess timed out; capture was not started.'
        }
        $output = $stdout.GetAwaiter().GetResult()
        $null = $stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0 -or $output.Length -gt 65536) {
            throw 'Readiness check failed; no child diagnostics or credentials are printed.'
        }
        return $output
    } finally { $process.Dispose() }
}

function New-AttendanceTaskDefinition {
    # Construct through Windows' real ScheduledTasks module. Neither register nor start.
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $shell = [Environment]::ProcessPath
    Assert-AbsolutePath $shell
    $arguments = @('-NoProfile', '-File', ('"' + $launcherPath + '"'), '-Run', '-Watch',
        '-NodePath', ('"' + $NodePath + '"'), '-PythonPath', ('"' + $PythonPath + '"'),
        '-GwsPath', ('"' + $GwsPath + '"'), '-MediaDirectory', ('"' + $MediaDirectory + '"'),
        '-InteractiveSessionConfirmed', '-CaptureCapacityConfirmed') -join ' '
    $action = New-ScheduledTaskAction -Execute $shell -Argument $arguments -WorkingDirectory $projectRoot -ErrorAction Stop
    $principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited -ErrorAction Stop
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $sid -ErrorAction Stop
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 `
        -RestartInterval ([TimeSpan]::FromMinutes(1)) -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ErrorAction Stop
    return New-ScheduledTask -Action $action -Principal $principal -Trigger $trigger -Settings $settings -ErrorAction Stop
}
function Register-OwnedAttendanceTask($Definition) {
    $name = 'Vidysea-Umesh-Calendar-Attendance'
    $existing = @(Get-ScheduledTask -TaskPath '\' -ErrorAction Stop | Where-Object TaskName -eq $name)
    if ($existing.Count -gt 1) { throw 'Ambiguous task ownership; no task was updated.' }
    if ($existing.Count -eq 1) {
        $owned = $existing[0]
        if ($owned.Principal.UserId -ne $Definition.Principal.UserId -or @($owned.Actions).Count -ne 1 -or
            $owned.Actions[0].Execute -ne $Definition.Actions[0].Execute -or
            $owned.Actions[0].WorkingDirectory -ne $projectRoot -or
            -not $owned.Actions[0].Arguments.StartsWith(('-NoProfile -File "' + $launcherPath + '" -Run -Watch '), [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Existing task is not owned by this operator and launcher; no task was updated.'
        }
        $null = Set-ScheduledTask -TaskName $name -TaskPath '\' -Action $Definition.Actions `
            -Trigger $Definition.Triggers -Settings $Definition.Settings -Principal $Definition.Principal -ErrorAction Stop
        return 'updated'
    }
    $null = Register-ScheduledTask -TaskName $name -TaskPath '\' -InputObject $Definition -ErrorAction Stop
    return 'registered'
}
if ($TaskPreview) {
    $task = New-AttendanceTaskDefinition
    $definition = [ordered]@{
        action=[ordered]@{execute=$task.Actions[0].Execute;arguments=$task.Actions[0].Arguments;workingDirectory=$task.Actions[0].WorkingDirectory}
        principal=[ordered]@{userId=$task.Principal.UserId;logonType=[string]$task.Principal.LogonType;runLevel=[string]$task.Principal.RunLevel}
        settings=[ordered]@{multipleInstances=[string]$task.Settings.MultipleInstances;restartCount=$task.Settings.RestartCount;
            restartInterval=$task.Settings.RestartInterval;executionTimeLimit=$task.Settings.ExecutionTimeLimit}
        trigger=[ordered]@{type=$task.Triggers[0].CimClass.CimClassName;userId=$task.Triggers[0].UserId}
    }
    [ordered]@{mode='task-preview';registered=$false;activationReady=$false;account=$account;
        taskName='Vidysea-Umesh-Calendar-Attendance';definition=$definition} | ConvertTo-Json -Depth 5
    return
}
if (-not $Run -and -not $InstallTask) {
    [ordered]@{mode='preview';account=$account;workingDirectory=$projectRoot;executable=$NodePath;
        arguments=$runnerArgs;python=$PythonPath;gws=$GwsPath;mediaDirectory=$MediaDirectory;
        captureStarted=$false;taskRegistered=$false;singleCapture='existing runner poller lock';
        activationRequires=@('verified target Google account and tenant','isolated work database',
            'real Windows audio/video live proof','installed Python/managed browser/media tools',
            'usable signed-in operator desktop, awake machine, measured capture capacity')} | ConvertTo-Json -Depth 4
    return
}
if (-not $IsWindows -or -not [Environment]::UserInteractive -or
    -not $InteractiveSessionConfirmed -or -not $CaptureCapacityConfirmed) {
    throw 'Run/install requires Windows plus explicit confirmation of a usable signed-in desktop, awake machine and measured capture capacity. No capture or task installation was started.'
}
foreach ($path in @($NodePath, $PythonPath, $GwsPath, $runnerPath,
    (Join-Path $MediaDirectory 'ffmpeg.exe'), (Join-Path $MediaDirectory 'ffprobe.exe'))) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'An absolute runtime prerequisite is missing; capture was not started.' }
}
$priorPath = $env:PATH
$priorPython = $env:LKB_PYTHON
$priorBrowser = $env:LKB_BROWSER_EXECUTABLE
$priorBackend = $env:LKB_CAPTURE_BACKEND
try {
    $env:PATH = (Split-Path -Parent $GwsPath) + ';' + $MediaDirectory + ';' + (Split-Path -Parent $NodePath) + ';' + $priorPath
    $env:LKB_PYTHON = $PythonPath
    $env:LKB_BROWSER_EXECUTABLE = 'cft'
    $env:LKB_CAPTURE_BACKEND = 'tab'
    $null = Invoke-ReadinessCommand $NodePath @('-e', 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)')
    $null = Invoke-ReadinessCommand $PythonPath @('-c', 'import pathlib,seleniumbase,pyautogui,psutil,websocket; p=pathlib.Path(seleniumbase.__file__).parent/"drivers"; assert (p/"cft_drivers"/"chrome-win64"/"chrome.exe").is_file(); assert (p/"uc_driver.exe").is_file()')
    $null = Invoke-ReadinessCommand (Join-Path $MediaDirectory 'ffmpeg.exe') @('-version')
    $null = Invoke-ReadinessCommand (Join-Path $MediaDirectory 'ffprobe.exe') @('-version')
    $null = Invoke-ReadinessCommand $NodePath @($runnerPath, '--calendar-attendance-account', $account, '--check-ready')
    if ($InstallTask) {
        $task = New-AttendanceTaskDefinition
        $disposition = Register-OwnedAttendanceTask $task
        [ordered]@{mode='installed';taskName='Vidysea-Umesh-Calendar-Attendance';disposition=$disposition;
            captureStarted=$false;liveAcceptance='pending observed attendance/restart'} | ConvertTo-Json
        return
    }
    $logDirectory = Join-Path $projectRoot 'data/calendar-attendance'
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    $logPath = Join-Path $logDirectory 'launcher.log'
    function Write-Lifecycle([string]$Message) {
        if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 262144) {
            Move-Item -LiteralPath $logPath -Destination ($logPath + '.previous') -Force
        }
        ([DateTime]::UtcNow.ToString('o') + ' ' + $Message) | Add-Content -LiteralPath $logPath
    }
    Write-Lifecycle 'Starting owned calendar attendance runner after readiness checks.'
    Push-Location -LiteralPath $projectRoot
    try {
        # Child output is intentionally not relayed or persisted: private provider payloads stay private.
        & $NodePath @runnerArgs 2>&1 | ForEach-Object { $null = $_ }
        $runnerExit = $LASTEXITCODE
    } finally { Pop-Location }
    Write-Lifecycle ('Runner terminal exit=' + $runnerExit)
    if ($runnerExit -ne 0) { throw 'Calendar attendance runner failed; launcher.log contains the terminal exit code.' }
} finally {
    $env:PATH = $priorPath
    $env:LKB_PYTHON = $priorPython
    $env:LKB_BROWSER_EXECUTABLE = $priorBrowser
    $env:LKB_CAPTURE_BACKEND = $priorBackend
}
