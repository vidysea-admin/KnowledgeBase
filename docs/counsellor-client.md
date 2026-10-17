# Voice and 3D counsellor client

The counsellor is a client of the existing authenticated `POST /ask`. It never selects a tenant, creates its own knowledge model or fabricates a source. Central web routing mounts `CounsellorPage` at `/counsellor`.

Type a question and press Ask counsellor, or select a voice language and press Dictate question. Dictation leaves the transcript editable. To ask without manual text submission, enable Voice conversation and press Ask by voice: the final microphone transcript is sent to the API and the answer is spoken automatically. Press Ask by voice for each subsequent turn. Stop voice and cancel answer aborts recognition and playback and prevents the pending answer from appearing or speaking; the API request may already be processing on the server.

Browser recognition requires a supported browser on HTTPS or localhost and microphone permission. Chromium implementations may send audio to the browser's speech service. This is disclosed before microphone controls; no application speech-provider credentials are sent to the browser. Browser speech synthesis uses available voices. If a matching language voice is unavailable or output fails, the page reports it and leaves the answer readable. Choosing a language controls recognition/readback, not the language of the existing brain's answer.

The locally rendered 3D character uses a depth-tested WebGL mesh and shaded ellipsoids. Jaw movement runs only during actual speech synthesis start/end events. Reduced motion stops head and jaw animation while text still labels the lifecycle. Missing WebGL or lost context is explicitly reported; voice and text remain usable. This procedural character does not require downloading an avatar or buying an avatar provider service.

Internal and web sources remain separate. Internal source links use returned session/turn provenance; malformed/missing provenance is shown honestly. Diarization labels are preserved without a claim of verified personal identity. Web source anchors allow HTTP(S) only. Coverage qualifications are included in both display and speech. Failed new questions clear the previous answer. Auth changes (including same-key login), cancellation and navigation retire pending API and voice callbacks.

Full T-013 acceptance requires a real microphone transcript, browser spoken output, visible 3D rendering, a real established provider/API answer and working downstream source click-through. Focused mocked lifecycle tests establish regression behavior only; they do not prove device/provider acceptance or close the parent task.
