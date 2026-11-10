import test from "node:test";
import assert from "node:assert/strict";
import { LocalMatchClient } from "../lib/matching/client.ts";
import { ENCODER } from "../lib/matching/config.ts";
test("resume and goals cross only the worker boundary; network fetch has no private input", async () => {
  const originalFetch = globalThis.fetch,
    originalWorker = globalThis.Worker;
  const requests = [],
    messages = [];
  let terminated = false;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json({
      modelVersion: ENCODER.version,
      data: [],
      documents: [],
      viewer: { context: "Existing profile context" },
    });
  };
  globalThis.Worker = class {
    postMessage(message) {
      messages.push(message);
      queueMicrotask(() =>
        this.onmessage({
          data: {
            id: message.id,
            type: message.type === "init" ? "ready" : "result",
            engine: "lexical",
            hits: [],
          },
        }),
      );
    }
    terminate() {
      terminated = true;
    }
  };
  let client;
  try {
    client = new LocalMatchClient(() => {}, true);
    await client.rank(
      "PRIVATE RESUME EXPERIENCE",
      "PRIVATE CAREER GOAL",
      "",
      new AbortController().signal,
    );
    await client.rank("", "Find peers", "", new AbortController().signal);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/alumni/matches?mode=semantic");
    assert.equal(requests[0].options.body, undefined);
    assert.equal(requests[0].options.cache, "no-store");
    assert.doesNotMatch(JSON.stringify(requests), /PRIVATE/);
    assert.equal(messages[1].text, "PRIVATE RESUME EXPERIENCE");
    assert.equal(messages[2].text, "Existing profile context");
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(client.rank("late", "goal", "", controller.signal), {
      name: "AbortError",
    });
    assert.equal(messages.length, 3);
    client.dispose();
    assert.equal(terminated, true);
    assert.equal(requests[0].options.signal.aborted, true);
  } finally {
    client?.dispose();
    globalThis.fetch = originalFetch;
    globalThis.Worker = originalWorker;
  }
});
