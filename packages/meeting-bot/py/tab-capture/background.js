// Chrome 116+: stream IDs minted by an invoked action can be consumed offscreen.
// Navigation in the captured tab retains the stream; closing the tab ends it.
let starting = false;
const registrationRuleBase = 910001, registrationRuleLimit = 910042;
const registrationResources = ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "csp_report", "media", "websocket", "webtransport", "webbundle", "other"];
let registrationReceipt;
globalThis.readRegistrationPolicy = async (primaryUrl) => {
  if (!chrome.declarativeNetRequest?.getDynamicRules || !chrome.contentSettings?.javascript?.get)
    throw new Error("Registration policy APIs unavailable");
  return {receipt: registrationReceipt || null,
    rules: (await chrome.declarativeNetRequest.getDynamicRules()).filter(r => r.id >= registrationRuleBase && r.id <= registrationRuleLimit),
    javascript: await chrome.contentSettings.javascript.get({primaryUrl})};
};
globalThis.installRegistrationPolicy = async (input) => {
  if (!input || input.receipt?.extensionId !== chrome.runtime.id || !Array.isArray(input.rules)
    || input.rules.length < 2 || input.rules.length > 41 || !input.primaryUrl
    || input.rules.some((r, index) => r.id !== registrationRuleBase + index
      || r.priority !== (index ? 2 : 1) || r.action?.type !== (index ? "allow" : "block")
      || Object.keys(r.action).length !== 1 || Object.keys(r.condition).length !== 2
      || JSON.stringify(r.condition.resourceTypes) !== JSON.stringify(registrationResources)
      || (index ? typeof r.condition.regexFilter !== "string" : r.condition.urlFilter !== "*")))
    throw new Error("Registration policy input refused");
  registrationReceipt = undefined;
  const old = (await chrome.declarativeNetRequest.getDynamicRules()).filter(r => r.id >= registrationRuleBase && r.id <= registrationRuleLimit);
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: old.map(r => r.id), addRules: input.rules});
  // Persist ownership before changing settings; a failed set leaves a recoverable rule marker.
  await chrome.contentSettings.javascript.set({primaryPattern: "<all_urls>", setting: "block", scope: "regular"});
  registrationReceipt = input.receipt;
  return await globalThis.readRegistrationPolicy(input.primaryUrl);
};
globalThis.clearRegistrationPolicy = async (input) => {
  // Called only through the owned privileged worker after restored page targets are gone.
  if (!input || input.extensionId !== chrome.runtime.id || input.priorTargetsGone !== true)
    throw new Error("Registration policy clearing refused");
  const old = (await chrome.declarativeNetRequest.getDynamicRules()).filter(r => r.id >= registrationRuleBase && r.id <= registrationRuleLimit);
  if (old.length) {
    const setting = await chrome.contentSettings.javascript.get({primaryUrl: input.primaryUrl});
    if (!["block", "allow"].includes(setting.setting) || !old.some(r => r.id === registrationRuleBase
      && r.priority === 1 && r.action?.type === "block" && r.condition?.urlFilter === "*"))
      throw new Error("Registration setting ownership unproved");
    // This extension owns only the registration JavaScript setting; other content types,
    // browser/user settings and other extensions' settings are untouched by this API.
    await chrome.contentSettings.javascript.clear({scope: "regular"});
    await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds: old.map(r => r.id)});
  }
  registrationReceipt = undefined;
  return await globalThis.readRegistrationPolicy(input.primaryUrl);
};
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
