# maker-checker Layer 3 -- commit guard. Installed under D-006; DENY branch added under D-014.
# Context-only output: plain text. Never emit "permissionDecision":"allow" (it would skip the
# permission prompt and auto-approve any payload containing 'git commit').
#
# WARN for everything EXCEPT one narrow case, which denies: a commit while a mutation is still
# armed in qa/.mutations-active. On 2026-09-08 the ISS-083 mutation (score: 0.5) was found applied
# to production source AFTER its checker had verified the restore as byte-identical; nothing in
# the repo would have caught it, and git log --all -S confirmed it stayed out of history by timing
# alone. Denying is safe here in a way that allowing never is: the comment above warns against
# "allow" because that SKIPS the human prompt, whereas "deny" only ever adds a stop.
# Input: the hook JSON via -InputJson (same convention as the lab hooks); falls back to stdin.
param([string]$InputJson = "")
# D-020: resolve against the WORKTREE being committed to, not CLAUDE_PROJECT_DIR. The hook used to
# Set-Location to the main tree unconditionally and then read qa/.mutations-active there, so every
# worktree's pre-commit consulted the MAIN tree's ledger -- one lane mutation-testing blocked commits
# in every other lane, for files not even present in them. That is worse for safety than throughput:
# the natural workaround is to delete another lane's row or bypass the hook, disarming a live control
# while a real mutation sits on real source. Scope narrowed; what it refuses is unchanged.
$__top = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($__top)) {
  Set-Location $__top.Trim()
} elseif ($env:CLAUDE_PROJECT_DIR) {
  Set-Location $env:CLAUDE_PROJECT_DIR
}
$in = $InputJson
if ([string]::IsNullOrWhiteSpace($in)) { try { $in = [Console]::In.ReadToEnd() } catch { $in = "" } }
if ($in -match 'git\s+commit') {
  # DENY (D-014): an armed mutation means a source file may still be deliberately broken.
  # Delegates the verdict to scripts/lib/mutate.mjs assert-clean, which re-checks each recorded path
  # against HEAD rather than trusting the ledger -- a row can be cleared while the file on disk is
  # still mutated, which is the failure this guards.
  if (Test-Path 'qa/.mutations-active') {
    $mut = & node scripts/lib/mutate.mjs assert-clean 2>&1
    if ($LASTEXITCODE -ne 0) {
      $reason = "BLOCKED: a mutation is still armed -- committing now could ship deliberately broken source. " + ($mut -join ' ')
      $out = @{ hookSpecificOutput = @{ hookEventName = 'PreToolUse'; permissionDecision = 'deny'; permissionDecisionReason = $reason } }
      $out | ConvertTo-Json -Compress -Depth 5 | Write-Output
      exit 0
    }
  }
  $u = 0
  if (Test-Path 'qa/manifests') {
    $u = (Get-ChildItem 'qa/manifests' -Filter *.md -ErrorAction SilentlyContinue | Select-String -Pattern 'Status: ready-for-check' -List | Measure-Object).Count
  }
  if ($u -gt 0) { Write-Output ("WARN maker-checker: $u unit(s) still awaiting /checker verdict. Commit should follow a PASS.") }
}
exit 0
