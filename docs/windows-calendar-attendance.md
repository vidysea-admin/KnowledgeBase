# Umesh Calendar attendance on the interim Windows machine

The launcher is `scripts/webinar/start-calendar-attendance.ps1`, run with PowerShell7.
Its default invocation prints a preview only. `-Watch` adds the existing runner's poller
flag without starting it. The account is fixed to `umeshsugara@vidysea.com`; the portable
runner independently verifies the acquired Calendar account and connected tenant.

```powershell
pwsh -NoProfile -File scripts/webinar/start-calendar-attendance.ps1
```

Executable locations are absolute. Defaults use this machine's bundled Node24,
project `.venv/Scripts/python.exe`, verified `.cache/tools/gws-0.22.5/gws.exe`, and
`.cache/tools/ffmpeg-9.0.2/bin`. Explicit `-NodePath`, `-PythonPath`, `-GwsPath` and
`-MediaDirectory` permit moving the machine-local tools. Runtime PATH changes apply
only to the launcher process and are restored on exit; credentials are never written.

Before a real run, complete the Google Desktop OAuth client setup and read-only
GWS login for the named account. Verify the primary Calendar identity, API tenant,
isolated work database and actual accepted event acquisition. The runner's existing
real Windows audio/video proof gate remains mandatory. Python, SeleniumBase,
PyAutoGUI, psutil, websocket-client, managed Chrome/UC driver and media tools must
exist. Sign in the managed browser on the usable operator desktop. Keep the machine
awake; measure available CPU/RAM while the shared Chrome worker is active before
confirming capture capacity. These operator confirmations do not replace live proof.

An explicitly authorized foreground run uses `-Run`; continuous polling additionally
uses `-Watch`. `-InteractiveSessionConfirmed -CaptureCapacityConfirmed` mean the
operator has verified the conditions above. The launcher then checks actual tools
and invokes the runner's nonmutating `--check-ready` before starting it. Failed checks
start no capture. No initial runtime has been activated by authoring this launcher.

`-TaskPreview` constructs a Windows ScheduledTasks definition without registering or
starting it: current-user interactive logon, least privilege, IgnoreNew, no execution
time cap, at most three failure restarts one minute apart. The generated action
is only a configuration preview. Explicit `-InstallTask` plus the same session/capacity
confirmations runs every readiness check first, then registers the current operator's
task or updates an existing task owned by the same operator and exact launcher.
Foreign task ownership refuses mutation. Installation does not call Start-ScheduledTask;
the task runs at the operator's next interactive logon. Each launch rechecks actual
tools and provider/tenant/live readiness. No task/service installation occurred here.

The existing runner owns the durable poller lock and allows one capture. Overlapping
meetings are reported rather than silently treated as attended. This launcher creates
no independent bot lane and does not remove locks or kill other processes. Lifecycle
logs contain fixed messages and exit codes only, under `data/calendar-attendance/`;
child output is not relayed/persisted. At 256 KiB the log rotates to one previous file.
Use the tenant-bound operations view for meeting/capture health. A terminal runner
failure makes the launcher fail, allowing the reviewed task restart policy to apply.

Reboot, logout, locked-session recovery and 24/7 attendance require observed live
acceptance on this machine. A task definition, local code PASS or successful preview
does not establish those outcomes. OAuth credentials are held by the same Windows
operator/keyring; no email, registration submission or connector-token export is
part of this launcher.
