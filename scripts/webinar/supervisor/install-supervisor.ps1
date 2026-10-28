param([string]$NodePath, [string]$ProjectRoot, [switch]$Install)
$ErrorActionPreference = 'Stop'

function Assert-LkbPhysicalPath([string]$Path, [bool]$Directory) {
    if (-not $Path -or $Path -notmatch '^[A-Za-z]:\\' -or $Path -match '["\x00-\x1f\x7f]') { throw 'Absolute physical paths required' }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -ne $Directory) { throw 'Unexpected path type' }
    while ($null -ne $item) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked paths refused' }
        $parent = Split-Path -Parent $item.FullName
        if (-not $parent -or $parent -eq $item.FullName) { break }
        $item = Get-Item -LiteralPath $parent -Force
    }
    return [IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function New-LkbProcessJob {
    if (-not ('LkbSupervisorJob' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public sealed class LkbSupervisorJob : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct Basic {
        public long ProcessTime, JobTime; public uint Flags;
        public UIntPtr MinWorking, MaxWorking; public uint ActiveLimit;
        public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Limits {
        public Basic Basic; public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr value, uint length);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    IntPtr handle;
    public LkbSupervisorJob() {
        handle=CreateJobObject(IntPtr.Zero,null);
        if(handle==IntPtr.Zero) throw new InvalidOperationException("Job creation failed");
        var limits=new Limits(); limits.Basic.Flags=0x2000; // KILL_ON_JOB_CLOSE
        int size=Marshal.SizeOf(typeof(Limits)); IntPtr memory=Marshal.AllocHGlobal(size);
        try {
            Marshal.StructureToPtr(limits,memory,false);
            if(!SetInformationJobObject(handle,9,memory,(uint)size)) throw new InvalidOperationException("Job limits failed");
        } catch { Dispose(); throw; } finally { Marshal.FreeHGlobal(memory); }
    }
    public void Assign(IntPtr process) {
        if(!AssignProcessToJobObject(handle,process)) throw new InvalidOperationException("Job assignment failed");
    }
    public void Dispose() { if(handle!=IntPtr.Zero) { CloseHandle(handle); handle=IntPtr.Zero; } }
}
'@
    }
    return New-Object LkbSupervisorJob
}

function Read-LkbBoundedStreams($Process, [int]$DeadlineMs = 15000) {
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $buffers = @((New-Object char[] 1024), (New-Object char[] 1024))
    $readers = @($Process.StandardOutput, $Process.StandardError)
    $texts = @((New-Object Text.StringBuilder), (New-Object Text.StringBuilder))
    $ended = @($false, $false)
    $pending = @($readers[0].ReadAsync($buffers[0], 0, 1024), $readers[1].ReadAsync($buffers[1], 0, 1024))
    while (-not ($ended[0] -and $ended[1] -and $Process.WaitForExit(0))) {
        if ($clock.ElapsedMilliseconds -ge $DeadlineMs) { throw 'Preview generator or stream drain timed out' }
        foreach ($index in 0,1) {
            if (-not $ended[$index] -and $pending[$index].IsCompleted) {
                $count = $pending[$index].GetAwaiter().GetResult()
                if ($count -eq 0) { $ended[$index] = $true; continue }
                if ($texts[$index].Length + $count -gt 65536) { throw 'Preview output or diagnostics too large' }
                $null = $texts[$index].Append($buffers[$index], 0, $count)
                $pending[$index] = $readers[$index].ReadAsync($buffers[$index], 0, 1024)
            }
        }
        [Threading.Thread]::Sleep(5)
    }
    if ($Process.ExitCode -ne 0) { throw 'Preview generator failed' }
    return $texts[0].ToString()
}

function Invoke-LkbPreview([string]$Node, [string]$Root) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $Node
    $start.Arguments = '"' + (Join-Path $Root 'scripts\webinar\setup.mjs') + '" --service-preview'
    $start.WorkingDirectory = $Root
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    $job = New-LkbProcessJob
    try {
        if (-not $process.Start()) { throw 'Preview generator failed' }
        try { $job.Assign($process.Handle) } catch { if (-not $process.HasExited) { $process.Kill() }; throw }
        return Read-LkbBoundedStreams $process
    } finally {
        # Closing the private job terminates this generator and its inherited descendants,
        # including descendants retaining pipes after the original parent has exited.
        $job.Dispose()
        if ($process.Id -and -not $process.HasExited) { $null = $process.WaitForExit(2000) }
        $process.Dispose()
    }
}

function Get-LkbSid { return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
function Get-LkbExistingTask([string]$Name) {
    $service = New-Object -ComObject 'Schedule.Service'; $service.Connect()
    $folder = $service.GetFolder('\')
    foreach ($task in $folder.GetTasks(1)) { if ($task.Name -eq $Name) { return $task.Xml } }
    return $null
}
function Register-LkbDisabledTask([string]$Name, [string]$Xml, [string]$Sid) {
    $service = New-Object -ComObject 'Schedule.Service'; $service.Connect()
    # TASK_CREATE (2), not CREATE_OR_UPDATE: refuses a concurrent name collision.
    $task = $service.GetFolder('\').RegisterTask($Name, $Xml, 2, $Sid, $null, 3, $null)
    return $task.Xml
}

function ConvertTo-LkbDisabledTask([string]$Text, [string]$Node, [string]$Root, [string]$Sid) {
    if ($Text.Length -gt 65536 -or $Text -match '<!DOCTYPE|<!ENTITY') { throw 'Unsafe task XML' }
    $xml = New-Object Xml.XmlDocument; $xml.XmlResolver = $null; $xml.LoadXml($Text)
    $ns = New-Object Xml.XmlNamespaceManager($xml.NameTable)
    $ns.AddNamespace('t', 'http://schemas.microsoft.com/windows/2004/02/mit/task')
    $get = { param($Path) $xml.SelectNodes($Path, $ns) }
    foreach ($path in @('/t:Task', '/t:Task/t:Actions', '/t:Task/t:Triggers', '/t:Task/t:Principals', '/t:Task/t:Settings')) {
        if (@(& $get $path).Count -ne 1) { throw 'Unexpected task structure' }
    }
    $checks = @{
        '/t:Task/t:Principals/t:Principal/t:UserId' = $Sid
        '/t:Task/t:Principals/t:Principal/t:LogonType' = 'InteractiveToken'
        '/t:Task/t:Principals/t:Principal/t:RunLevel' = 'LeastPrivilege'
        '/t:Task/t:Triggers/t:LogonTrigger/t:UserId' = $Sid
        '/t:Task/t:Actions/t:Exec/t:Command' = $Node
        '/t:Task/t:Actions/t:Exec/t:Arguments' = ('"' + (Join-Path $Root 'scripts\webinar\run-pipeline.mjs') + '" --run --watch')
        '/t:Task/t:Actions/t:Exec/t:WorkingDirectory' = $Root
        '/t:Task/t:Settings/t:MultipleInstancesPolicy' = 'IgnoreNew'
        '/t:Task/t:Settings/t:ExecutionTimeLimit' = 'PT0S'
        '/t:Task/t:Settings/t:RestartOnFailure/t:Interval' = 'PT1M'
        '/t:Task/t:Settings/t:RestartOnFailure/t:Count' = '3'
    }
    foreach ($path in $checks.Keys) {
        $nodes = @(& $get $path)
        if ($nodes.Count -ne 1 -or $nodes[0].InnerText -cne $checks[$path]) { throw 'Task binding or settings mismatch' }
    }
    foreach ($path in @('/t:Task/t:Actions/*', '/t:Task/t:Triggers/*', '/t:Task/t:Principals/*')) {
        if (@(& $get $path).Count -ne 1) { throw 'Unexpected task action, trigger or principal' }
    }
    if ($xml.Task.Actions.Context -cne 'Operator' -or $xml.Task.Principals.Principal.id -cne 'Operator') { throw 'Task principal context mismatch' }
    $trigger = @(& $get '/t:Task/t:Triggers/t:LogonTrigger/t:Enabled')
    if ($trigger.Count -ne 1) { throw 'Missing trigger enable setting' }
    $trigger[0].InnerText = 'false'
    $settings = @(& $get '/t:Task/t:Settings')[0]
    $enabled = @(& $get '/t:Task/t:Settings/t:Enabled')
    if ($enabled.Count -gt 1) { throw 'Duplicate enable setting' }
    if ($enabled.Count -eq 0) { $element = $xml.CreateElement('Enabled', $ns.LookupNamespace('t')); $null = $settings.AppendChild($element) } else { $element = $enabled[0] }
    $element.InnerText = 'false'
    return $xml.OuterXml
}

function Install-LkbSupervisor([string]$Node, [string]$Root, [bool]$Apply) {
    $name = 'lkb-webinar-portable-supervisor'
    $Node = Assert-LkbPhysicalPath $Node $false
    $Root = Assert-LkbPhysicalPath $Root $true
    if ([IO.Path]::GetFileName($Node) -ine 'node.exe') { throw 'Explicit node.exe required' }
    $null = Assert-LkbPhysicalPath (Join-Path $Root 'scripts\webinar\setup.mjs') $false
    $null = Assert-LkbPhysicalPath (Join-Path $Root 'scripts\webinar\run-pipeline.mjs') $false
    $sid = Get-LkbSid
    if ($sid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$') { throw 'Current local/domain user required' }
    $disabled = ConvertTo-LkbDisabledTask (Invoke-LkbPreview $Node $Root) $Node $Root $sid
    if (-not $Apply) { Write-Output "PREVIEW (nothing changed): $name"; Write-Output $disabled; return }
    if ($null -ne (Get-LkbExistingTask $name)) { throw 'Existing supervisor task refused; no replacement' }
    $registered = Register-LkbDisabledTask $name $disabled $sid
    $checked = ConvertTo-LkbDisabledTask $registered $Node $Root $sid
    [xml]$observed = $registered
    if ($observed.Task.Settings.Enabled -cne 'false' -or $observed.Task.Triggers.LogonTrigger.Enabled -cne 'false') { throw 'Registered task is not disabled; inspect manually' }
    Write-Output "INSTALLED DISABLED: $name (activation and live recovery remain HOLD)"
}

if ($MyInvocation.InvocationName -ne '.') { Install-LkbSupervisor $NodePath $ProjectRoot ([bool]$Install) }
