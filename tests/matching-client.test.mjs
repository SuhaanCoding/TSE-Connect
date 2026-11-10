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
    assert.equal(
      requests[0].url,
      "/api/alumni/matches?mode=semantic&format=paged-v1&lexical=1",
    );
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

test("paged downloads assemble completely before ranking without sending private context", async () => {
  const previousFetch = globalThis.fetch,
    previousWorker = globalThis.Worker,
    requests = [],
    messages = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    const offset = new URL(url, "https://test.invalid").searchParams.get(
      "offset",
    );
    return Response.json({
      data: [],
      documents: [{ id: offset ? "second" : "first" }],
      modelVersion: ENCODER.version,
      viewer: { context: "" },
      revision: "fixed-revision",
      documentsTotal: 2,
      nextOffset: offset ? null : 1,
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
    terminate() {}
  };
  let client;
  try {
    client = new LocalMatchClient(() => {});
    await client.rank(
      "private resume",
      "private goal",
      "",
      new AbortController().signal,
    );
    assert.equal(requests.length, 2);
    assert.match(requests[1], /offset=1&revision=fixed-revision/);
    assert.doesNotMatch(requests.join(" "), /private/);
    assert.equal(messages[0].documents.length, 2);
  } finally {
    client?.dispose();
    globalThis.fetch = previousFetch;
    globalThis.Worker = previousWorker;
  }
});
