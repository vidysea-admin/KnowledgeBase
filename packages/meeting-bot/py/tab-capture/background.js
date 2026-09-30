// Chrome 116+: stream IDs minted by an invoked action can be consumed offscreen.
// Navigation in the captured tab retains the stream; closing the tab ends it.
let starting = false;
chrome.action.onClicked.addListener(async (tab) => {
  if (starting) return;
  starting = true;
  let config;
  try {
    config = await (await fetch(chrome.runtime.getURL("config.json"))).json();
    if ((await chrome.tabCapture.getCapturedTabs()).some((t) => t.status === "active")) return;
    const contexts = await chrome.runtime.getContexts({contextTypes: ["OFFSCREEN_DOCUMENT"]});
    if (!contexts.length) await chrome.offscreen.createDocument({
      url: "recorder.html", reasons: ["USER_MEDIA"], justification: "Record the invited webinar tab with audio and video"
    });
    const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId: tab.id});
    const result = await chrome.runtime.sendMessage({target: "recorder", type: "start", streamId, config});
    if (!result?.ok) throw new Error(result?.error || "Recorder did not acknowledge start");
  } catch (error) {
    if (config) await fetch(`${config.endpoint}/event`, {method: "POST",
      headers: {Authorization: `Bearer ${config.token}`, "Content-Type": "application/json"},
      body: JSON.stringify({event: "capture-error", error: String(error.message || error)})}).catch(() => {});
  } finally { starting = false; }
});
