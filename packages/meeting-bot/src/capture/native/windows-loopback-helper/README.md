# Owned browser process-loopback producer

Source only: no executable or measured qualification is supplied. Build with MSVC C++20,
a Windows SDK containing `audioclientactivationparams.h`, and CMake 3.24+. The helper
requires Windows build 20348 or newer and includes only the explicitly owned browser
process tree. Unsupported native formats and timestamp/discontinuity flags fail closed.
There is no endpoint, system-wide loopback or AudioContext fallback.

The server starts the pinned private executable with owned PID and creation FILETIME.
It writes a 32-byte random challenge to inherited stdin, holds stdin open during capture,
then closes it to request stop. Inherited stdout frames are `uint32le metadataLength`,
`uint32le rawPcmLength`, UTF-8 JSON metadata, raw PCM. Metadata is <=4096 bytes and raw
PCM <=4 MiB. Each response echoes the challenge; lengths, packet order and completion
are checked by `windows-capture-clock.ts`. Metadata is private transport observation,
never a calibration JSON input. Standalone parser use cannot mint capture authority.

`GetBuffer` provides device frame position and QPC timestamp for the first packet frame.
Its timestamp uses **100 ns units**, unlike `QueryPerformanceCounter` raw ticks. Before
and after acquiring each packet, the helper brackets precise UTC FILETIME reads with raw
QPC reads. The adapter records both representations, frame-preserving mean/downmix and
quantization, source/output hashes and exact retained stream count/hash. Consumers must
retain raw PCM privately for conversion replay and compare the canonical stream hash to
their physically closed spool; successful callbacks alone do not prove physical retention.

Transport backpressure can cause a capture glitch; such a run is refused rather than
silently repairing or padding samples. Unknown clock accuracy, browser-video/source lag,
sampler lag and drift stay unknown. The opaque closed packet proof grants no
`QualifiedCaptureClock`; independent genuine applicability measurement remains required.

Primary references:

- https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer
- https://learn.microsoft.com/en-us/windows/win32/api/audioclientactivationparams/ns-audioclientactivationparams-audioclient_process_loopback_params
- https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps
- https://github.com/microsoft/Windows-classic-samples/blob/main/Samples/ApplicationLoopback/cpp/LoopbackCapture.cpp
