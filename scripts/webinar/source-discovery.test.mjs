/** Cross-layer source discovery integration; fixtures only, no provider requests. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runPipelineWatch } from "./run-pipeline.mjs";
import { scanGmailForMeetingCandidates } from "../../apps/api/src/gws-gmail.ts";
import { listUpcomingGwsMeetings } from "../../apps/api/src/gws-calendar.ts";
import { createGwsCalendarReadDeps } from "../../apps/api/src/store.ts";
import { startTestServer } from "../../apps/api/src/testUtils.ts";
import { buildTestDeps, fakeKeyStore } from "../../apps/api/src/fixtures.ts";
import { selectAutoRecordItems } from "../../packages/meeting-bot/src/calendar/auto-join.ts";
import { classifyWebinarInvite } from "../../packages/meeting-bot/src/calendar/auto-record-policy.ts";
import { reconcileWebinarSources } from "../../packages/meeting-bot/src/calendar/calendar-client.ts";
import { createHttpCalendarLoader, loadWebinarSourcesWithHealth } from "../../packages/meeting-bot/src/calendar/schedule-tick.ts";

test("watcher privacy retains operational fields without mutating private state", async () => {
    const stamp = "2026-10-05T14:00:00.000Z";
    const secrets = ["registration-secret", "join-secret", "operator-secret", "snapshot-secret", "bare-secret@example.test"];
    const result = {status: "running", toRecord: [{meetingUrl: secrets[1]}], skipped: [{source: secrets[3]}], operations: {
        "session-one": {status: "action_required", reason: "needs-registration", updatedAt: stamp, startTime: stamp,
            registration: {phase: "confirmed", registrationUrl: "https://example.test/?token=" + secrets[0],
                meetingUrl: "https://example.test/?token=" + secrets[1], operator: secrets[2], snapshot: secrets[3]},
            contact: secrets[4]},
        "session-two": {status: secrets[0], reason: secrets[4], updatedAt: secrets[1], registration: {phase: secrets[2]}},
    }};
    const before = JSON.stringify(result), logs = [];
    let ticks = 0, waits = 0;
    await runPipelineWatch({}, {tick: async () => {ticks++; return result;}, log: value => logs.push(value), wait: async () => {waits++;}});
    assert.equal(ticks, 1); assert.equal(waits, 0);
    assert.equal(JSON.stringify(result), before, "logging must not mutate durable private state");
    for (const secret of secrets) assert.equal(logs.join("\n").includes(secret), false, "private value escaped public projection");
    const output = JSON.parse(logs[0]);
    assert.equal(output.status, "running"); assert.equal(output.toRecord, 1); assert.equal(output.skipped, 1);
    assert.equal(output.operations.total, 2); assert.equal(output.operations.omitted, 0);
    assert.deepEqual(output.operations.items[0], {id: "session-one", status: "action_required", registrationPhase: "confirmed",
        reason: "needs-registration", updatedAt: stamp, startTime: stamp});
    assert.deepEqual(output.operations.items[1], {id: "session-two", reason: "details-private"});
});

test("watcher privacy bounds rows and excludes unknown envelope values", async () => {
    const operations = Object.fromEntries(Array.from({length: 201}, (_, n) => [`session-${n}`, {status: "queued"}]));
    const logs = [];
    await runPipelineWatch({}, {tick: async () => ({status: "private-envelope", operations}), log: value => logs.push(value)});
    const output = JSON.parse(logs[0]);
    assert.equal(output.status, "unavailable"); assert.equal(output.toRecord, 0); assert.equal(output.skipped, 0);
    assert.equal(output.operations.total, 201); assert.equal(output.operations.items.length, 200); assert.equal(output.operations.omitted, 1);
    assert.equal(logs[0].includes("private-envelope"), false);
});

test("watcher privacy preserves tick errors without logging a result", async () => {
    const logs = [], failure = new Error("fixture tick failure");
    await assert.rejects(runPipelineWatch({}, {tick: async () => {throw failure;}, log: value => logs.push(value)}), error => error === failure);
    assert.deepEqual(logs, []);
});

test("each classifier-positive vocabulary form is discoverable without a known host or sender", async () => {
    const titles = ["Career webinar", "Career seminar", "Educator Dialogues", "In Focus", "In-Focus", "Online Workshop", "Virtual Conference"];
    for (const title of titles) {
        assert.equal(classifyWebinarInvite(title), "webinar");
        const rows = await scanGmailForMeetingCandidates(100, async (args) => {
            const params = JSON.parse(args[args.indexOf("--params") + 1]);
            if (args.includes("list")) {
                const terms = params.q.slice(1, -1).split(/\s+OR\s+/).map((term) => term.replace(/^"|"$/g, "").toLowerCase());
                const matched = terms.some(term => !term.includes(":") && title.toLowerCase().includes(term));
                return JSON.stringify({ messages: matched ? [{ id: "title-only" }] : [] });
            }
            return JSON.stringify({ id: "title-only", payload: { headers: [{ name: "From", value: "new@unknown.org" },
                        { name: "Subject", value: title }], body: { data: Buffer.from("Details https://events.unknown.org/live").toString("base64url") } } });
        });
        assert.equal(rows.length, 1, `search must discover classifier-positive title ${title}`);
        assert.equal(rows[0]?.subject, title);
        assert.equal(rows[0]?.meetingUrl, undefined);
        assert.equal(rows[0]?.startTime, undefined);
    }
});

test("discovery retains old invitations and unknown platforms without fabricating launch evidence", async () => {
    const messages = [
        { id: "old", subject: "Student visa webinar", body: "Join https://meet.google.com/abc-defg-hij", date: "Mon, 1 Jan 2024 00:00:00 +0000" },
        { id: "unknown", subject: "Webinar invitation", body: "Join https://events.example.org/session" },
        { id: "personal", subject: "Team meeting invitation", body: "Invitation attached; see invite.ics" },
    ];
    const candidates = await scanGmailForMeetingCandidates(100, async (args) => {
        const params = JSON.parse(args[args.indexOf("--params") + 1]);
        if (args.includes("list")) {
            assert.doesNotMatch(params.q, /newer_than:|after:|older_than:|before:/);
            for (const term of ['webinar', 'webcast', '"online seminar"', '"virtual conference"', 'invitation', 'filename:ics', 'meet.google.com', 'from:theoutreachcollective.in'])
                assert.ok(params.q.includes(term));
            return JSON.stringify({ messages: messages.map(({ id }) => ({ id })) });
        }
        const message = messages.find(row => row.id === params.id);
        return JSON.stringify({ id: message.id, payload: { headers: [
                    { name: "From", value: "host@example.org" }, { name: "Subject", value: message.subject },
                    { name: "Date", value: message.date ?? "Wed, 30 Sep 2026 00:00:00 +0000" },
                ], body: { data: Buffer.from(message.body).toString("base64url") } } });
    });
    assert.deepEqual(candidates.map(row => row.messageId), ["old", "unknown", "personal"]);
    assert.equal(candidates[0]?.meetingUrl, "https://meet.google.com/abc-defg-hij");
    for (const row of candidates.slice(1)) {
        assert.equal(row.meetingUrl, undefined);
        assert.equal(row.startTime, undefined);
        assert.equal(row.endTime, undefined);
    }
    const selection = selectAutoRecordItems({ calendarEvents: [], candidates: candidates.map(row => ({ ...row,
            id: row.messageId, title: row.subject, status: "pending" })), now: "2026-09-30T09:59:00Z",
        leadMinutes: 5, trustedSenders: { emails: [], domains: [] }, alreadyScheduled: [], everyWebinar: true });
    assert.equal(selection.toSchedule.length, 0);
    assert.equal(selection.skipped.find(row => row.sessionKey === "gmail:personal")?.reason, "not-webinar");
});

test("actual Calendar adapter failures cross HTTP as failed discovery, while empty success stays healthy", async () => {
    let reply = { items: [] }, failed = false;
    const server = await startTestServer(buildTestDeps({
        keyStore: fakeKeyStore({ "cal-key": { tenantId: "tenant-1", scopes: ["calendar"] } }),
        calendar: { listUpcoming: () => listUpcomingGwsMeetings(14, async () => {
                if (failed)
                    throw new Error("secret provider details https://private.invalid/?token=secret");
                return JSON.stringify(reply);
            }) },
    }));
    const deps = { loadCalendarEvents: createHttpCalendarLoader(server.baseUrl, "cal-key"), loadCandidates: async () => [] };
    const previous = { calendar: { status: "healthy", checkedAt: "2026-09-29T12:00:00Z", lastSuccessAt: "2026-09-29T12:00:00Z" } };
    try {
        for (const invalid of [null, [], {}, { error: { code: 401 } }, { items: {} }, { items: [{ id: 5 }] }, { items: [{ id: "e", start: { dateTime: "bad" } }] }]) {
            reply = invalid;
            const response = await fetch(`${server.baseUrl}/calendar/upcoming`, { headers: { authorization: "Bearer cal-key" } });
            assert.equal(response.status, 503);
            assert.ok(!(await response.text()).includes("secret"));
            const result = await loadWebinarSourcesWithHealth(deps, "2026-09-30T12:00:00Z", previous);
            assert.equal(result.failed, true);
            assert.equal(result.health.calendar.status, "failed");
            assert.equal(result.health.calendar.lastSuccessAt, previous.calendar.lastSuccessAt);
        }
        failed = true;
        await assert.rejects(deps.loadCalendarEvents());
        failed = false;
        for (const valid of [{ items: [] }, { kind: "calendar#events" }]) {
            reply = valid;
            const result = await loadWebinarSourcesWithHealth(deps, "2026-09-30T12:00:00Z", previous);
            assert.equal(result.failed, false);
            assert.deepEqual(result.calendarEvents, []);
            assert.equal(result.health.calendar.lastSuccessAt, "2026-09-30T12:00:00Z");
        }
    }
    finally {
        await server.close();
    }
});

test("ISS-WEBINARRELEASE-013: cancelled Calendar occurrence suppresses its stale Gmail alias", async () => {
    const cancelled = { id: "cancelled-webinar", status: "cancelled", summary: "AI webinar",
        start: { dateTime: "2026-09-30T10:00:00Z" }, end: { dateTime: "2026-09-30T11:00:00Z" },
        hangoutLink: "https://meet.google.com/abc-defg-hij" };
    let providerFixtureCalls = 0;
    const calendarEvents = await listUpcomingGwsMeetings(14, async () => {
        providerFixtureCalls++;
        return JSON.stringify({ items: [cancelled] });
    });
    const result = selectAutoRecordItems({ calendarEvents, candidates: [{ id: "old-gmail-invite",
                title: cancelled.summary, senderEmail: "host@example.org", senderDomain: "example.org", status: "pending",
                meetingUrl: cancelled.hangoutLink, startTime: cancelled.start.dateTime, endTime: cancelled.end.dateTime, kind: "upcoming" }],
        now: "2026-09-30T10:00:00Z", leadMinutes: 5, trustedSenders: { emails: [], domains: [] },
        alreadyScheduled: new Set(), everyWebinar: true });
    assert.equal(providerFixtureCalls, 1);
    assert.equal(result.toSchedule.length, 0, "a cancelled occurrence must not record via stale Gmail");
});

test("authenticated Calendar discovery retains tombstones while default UI excludes them", async () => {
    let reads = 0;
    const rows = [{ id: "deleted", title: "AI webinar", startTime: "", endTime: "", cancelled: true },
        { id: "registration", title: "AI webinar", startTime: "2026-10-01T12:00:00Z", endTime: "" },
        { id: "live", title: "AI webinar", startTime: "2026-10-01T12:00:00Z", endTime: "2026-10-01T13:00:00Z", meetingUrl: "https://meet.google.com/abc-defg-hij" }];
    const server = await startTestServer(buildTestDeps({ calendar: { listUpcoming: async () => { reads++; return rows; } },
        keyStore: fakeKeyStore({ "cal-key": { tenantId: "tenant-1", scopes: ["calendar"] } }) }));
    const headers = { authorization: "Bearer cal-key" };
    try {
        const normal = await fetch(`${server.baseUrl}/calendar/upcoming`, { headers });
        const normalBody = await normal.json();
        assert.deepEqual(normalBody.meetings.map(r => r.id), ["live"]);
        const events = await createHttpCalendarLoader(server.baseUrl, "cal-key")();
        assert.deepEqual(events.map(r => r.id), ["deleted", "registration", "live"]);
        assert.equal(events[0].cancelled, true);
        for (const query of ["discovery=0", "discovery=true", "discovery=1&discovery=1", "discovery[x]=1"]) {
            const before = reads;
            assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming?${query}`, { headers })).status, 400);
            assert.equal(reads, before);
        }
        const before = reads;
        assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming?discovery=1`)).status, 401);
        assert.equal(reads, before);
    }
    finally {
        await server.close();
    }
});

test("delta HTTP checkpoint is encoded once and owner/query guards run before provider", async () => {
    const since = "2026-09-01T00:00:00.000Z", seen = [];
    const calendar = createGwsCalendarReadDeps("tenant-1", async (_days, _run, changedSince) => { seen.push(changedSince); return []; });
    const server = await startTestServer(buildTestDeps({ calendar, keyStore: fakeKeyStore({
            "cal-key": { tenantId: "tenant-1", scopes: ["calendar"] }, "foreign": { tenantId: "tenant-2", scopes: ["calendar"] },
        }) }));
    try {
        let callbacks = 0;
        assert.deepEqual(await createHttpCalendarLoader(server.baseUrl, "cal-key", () => { callbacks++; return since; })(), []);
        assert.equal(callbacks, 1);
        assert.deepEqual(seen, [since]);
        const query = new URLSearchParams({ discovery: "1", changedSince: since });
        assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming?${query}`, { headers: { authorization: "Bearer foreign" } })).status, 503);
        for (const query of ["changedSince=" + encodeURIComponent(since), "discovery=1&changedSince=bad", "discovery=1&changedSince=" + encodeURIComponent(since) + "&changedSince=" + encodeURIComponent(since), "discovery=1&changedSince[x]=1"]) {
            assert.equal((await fetch(`${server.baseUrl}/calendar/upcoming?${query}`, { headers: { authorization: "Bearer cal-key" } })).status, 400);
        }
        for (const invalid of ["bad", "2026-02-30T00:00:00.000Z", "2026-09-01T00:00:00Z"])
            await assert.rejects(createHttpCalendarLoader(server.baseUrl, "cal-key", () => invalid)(), /checkpoint/);
        assert.deepEqual(seen, [since], "invalid queries, callbacks and foreign owner must never reach provider");
    }
    finally {
        await server.close();
    }
});

test("Google timezone metadata crosses actual adapter/reconciler/selector without losing cancellation", async () => {
    const live = { id: "instance-tz", summary: "AI webinar", recurringEventId: "series-tz", updated: "2026-10-01T08:00:00Z",
        originalStartTime: { dateTime: "2026-10-01T10:00:00Z", timeZone: "Etc/UTC" },
        start: { dateTime: "2026-10-01T10:00:00Z", timeZone: "Etc/UTC" }, end: { dateTime: "2026-10-01T11:00:00Z" }, hangoutLink: "https://meet.google.com/abc-defg-hij" };
    const checkedAt = "2026-10-01T09:56:00.000Z", acquisition = { complete: true, historyComplete: true };
    const calendarEvents = await listUpcomingGwsMeetings(14, async () => JSON.stringify({ items: [live] }));
    assert.deepEqual(calendarEvents[0].originalStartTime, { dateTime: live.originalStartTime.dateTime });
    const first = reconcileWebinarSources({ tenantId: "fixture", checkedAt, acquisition, calendarEvents, candidates: [] });
    const select = (r) => selectAutoRecordItems({ calendarEvents: r.calendarEvents, candidates: r.candidates,
        now: checkedAt, leadMinutes: 5, trustedSenders: { emails: [], domains: [] }, alreadyScheduled: new Set(), everyWebinar: true });
    assert.equal(select(first).toSchedule.length, 1);
    const tombstones = await listUpcomingGwsMeetings(14, async () => JSON.stringify({ items: [
            { id: live.id, status: "cancelled", recurringEventId: live.recurringEventId, originalStartTime: live.originalStartTime },
        ] }));
    const cancelled = reconcileWebinarSources({ tenantId: "fixture", checkedAt, acquisition, previous: first.state, calendarEvents: tombstones, candidates: [] });
    assert.equal(cancelled.transitions.filter(t => t.reason === "cancelled").length, 1);
    assert.equal(cancelled.calendarEvents[0].cancelled, true);
    assert.equal(select(cancelled).toSchedule.length, 0);
});
