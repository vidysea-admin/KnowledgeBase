# T-045 runtime provision proposal

Reviewable proposal only. No binary download, host install, cookie setup, provider call or deployment
was executed. Root's runtime owner controls shared Docker/package/lock changes and approved provisioning.

## Pinned native tools

Proposed yt-dlp stable pin: **2026.08.19**, the immutable release returned by the upstream latest page
when inspected. Use its exact artifact and SHA256 below, reject mismatches before executing, and do
not auto-update or fetch remote EJS components. The official executables include their required EJS
component; Node 24 already supplies the JavaScript runtime once explicitly enabled by our argv.
[Release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19),
[published artifact digests](https://github.com/yt-dlp/yt-dlp/releases/expanded_assets/2026.08.19),
[runtime and EJS requirements](https://github.com/yt-dlp/yt-dlp#dependencies).

| Runtime | Exact artifact | SHA256 |
| --- | --- | --- |
| Windows x64 | https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe | 66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a |
| Debian/Ubuntu Linux x64 | https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux | 58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a |
| Debian/Ubuntu Linux arm64 | https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp_linux_aarch64 | b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc |

Do not select the Unix zipimport `yt-dlp` asset for this proposal: that form needs Python, while the
listed standalone artifacts avoid adding a Python runtime to the API image. Select only the image's
explicit supported TARGETARCH; fail the build on another architecture rather than guessing.

ffmpeg and ffprobe are both required: yt-dlp normalizes acquired media to m4a, while the source adapter
measures those exact local bytes before real STT. Current Windows command metadata shows both commands
present; capture executable versions and hashes before reuse. No replacement/global installation is
proposed on this shared host. Source-media probing enables only ffprobe's `file` protocol.

## Windows portable plan

Candidate binary path:
`<workspace>\.cache\media-tools\yt-dlp\2026.08.19\yt-dlp.exe`.
The existing .gitignore excludes .cache/. Root may provision that isolated path after approval,
verify the exact Windows SHA256, then run only `--version` initially. No global PATH, registry,
system package manager, browser profile or .env mutation is necessary.

Configure the application process explicitly, using the verified native executable paths:

```text
LKB_YT_DLP_PATH=<workspace>\.cache\media-tools\yt-dlp\2026.08.19\yt-dlp.exe
LKB_FFMPEG_PATH=<verified absolute ffmpeg executable or directory>
LKB_FFPROBE_PATH=<verified absolute ffprobe executable>
LKB_SOURCE_INTAKE=1
LKB_SOURCE_INTAKE_MODEL=<explicit approved model identifier>
GEMINI_API_KEY=<existing configured secret; never print or paste into evidence>
```

Hosted acquisition is separately opt-in at `LKB_HOSTED_SOURCE_ACQUISITION=1`. Protected OnAir may use
an existing authorized `LKB_ONAIR_COOKIE_HEADER`, supplied through the approved secret mechanism.
This proposal creates no cookie or login session. An event without one verified iframe recording
embed still refuses; an actual authorized on-demand run remains required.

## Docker/CI integration proposal

Root should create a bounded native-tool acquisition stage, fetch only the architecture-specific
pinned release asset, verify its SHA256 and copy the executable into `/usr/local/bin/yt-dlp`.
Install the Debian runtime packages `ffmpeg` and `ca-certificates` before final `USER node`; ffmpeg
also supplies ffprobe. Keep download tooling in the acquisition stage, record the resolved Debian
package versions/base digest in the CI receipt, and preserve the existing non-root API runtime.
No npm dependency is introduced by the T-045 source modules.

Set container paths to `/usr/local/bin/yt-dlp`, `/usr/bin/ffmpeg`, `/usr/bin/ffprobe`. Source argv
explicitly uses `--no-js-runtimes --js-runtimes node:<current process.execPath>` and
`--no-remote-components`, so an extra Deno runtime or on-demand remote script download is unnecessary.

Before claiming package readiness, root should retain the API bundler's sorted external specifier
set and prove each resolves from the final `/app/apps/api/dist/server.js` location. Workspace source
is bundled, but bare npm imports resolve from the bundle's API/root node_modules directories.
Only copying a workspace's private node_modules elsewhere does not establish that resolution.
Reconcile missing externals into root-owned API declarations/lock/runtime installation, then execute
the real final-image startup and smoke consumer. T-045 adds only Node built-in/covered workspace
imports; its native tools are separately required and not supplied by pnpm.

CI provision probes: pinned yt-dlp `--version`, ffmpeg/ffprobe versions, a real playable local m4a
duration probe, exact final bundle-external resolution, non-root image startup and existing HTTP
consumers. These probes do not download a video, use login cookies, call an AI provider or prove
any required source admission. Actual five-source operation and downstream knowledge acceptance
remain separate authorized runs, including media hashes, durations, tenant readback, index and Ask.

## Evidence limits

The upstream checksum-manifest download could not be read through the web tool's release-asset
redirect. The digests above came from GitHub's rendered immutable release asset list; no artifact
bytes were downloaded or executed. Root must compare the actual approved downloaded bytes against
these pins before execution and record the source/version/hash receipt. This is a provision plan,
not a successful install or source-operation claim.
