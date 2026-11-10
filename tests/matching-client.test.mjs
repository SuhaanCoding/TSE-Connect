import test from "node:test";
import assert from "node:assert/strict";
import { ServerMatchClient } from "../lib/matching/client.ts";
const result = {
  index: { data: [], viewer: { context: "" } },
  hits: [],
  engine: "semantic",
  warning: "",
};
test("server matching posts private inputs without URL/storage/model downloads and reuses tab-only results", async () => {
  const previous = globalThis.fetch,
    requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return Response.json(result);
  };
  const client = new ServerMatchClient(() => {});
  try {
    const signal = new AbortController().signal;
    await client.rank("PRIVATE EXPERIENCE", "PRIVATE GOAL", "systems", signal);
    await client.rank("PRIVATE EXPERIENCE", "PRIVATE GOAL", "systems", signal);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/alumni/matches");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.cache, "no-store");
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      text: "PRIVATE EXPERIENCE",
      goal: "PRIVATE GOAL",
      lookup: "systems",
      lexicalOnly: false,
    });
    client.dispose();
    await client.rank("PRIVATE EXPERIENCE", "PRIVATE GOAL", "systems", signal);
    assert.equal(requests.length, 2);
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(client.rank("late", "goal", "", cancelled.signal), {
      name: "AbortError",
    });
    assert.equal(requests.length, 2);
  } finally {
    client.dispose();
    globalThis.fetch = previous;
  }
});
test("identical in-flight contexts share one request and removal aborts the request", async () => {
  const previous = globalThis.fetch;
  let requests = 0,
    captured;
  globalThis.fetch = async (_url, options) => {
    requests++;
    captured = options.signal;
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener(
        "abort",
        () => reject(new DOMException("Cancelled", "AbortError")),
        { once: true },
      ),
    );
  };
  const client = new ServerMatchClient(() => {});
  try {
    const signal = new AbortController().signal;
    const a = client.rank("private", "goal", "", signal),
      b = client.rank("private", "goal", "", signal);
    assert.equal(requests, 1);
    client.dispose();
    assert.equal(captured.aborted, true);
    await assert.rejects(a, { name: "AbortError" });
    await assert.rejects(b, { name: "AbortError" });
  } finally {
    client.dispose();
    globalThis.fetch = previous;
  }
});
test("failed server requests are retryable and explicit word matching is honored", async () => {
  const previous = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_url, options) => {
    requests++;
    assert.equal(JSON.parse(options.body).lexicalOnly, true);
    return requests === 1
      ? Response.json({ error: "Couldn’t finish matching." }, { status: 503 })
      : Response.json({ ...result, engine: "lexical" });
  };
  const client = new ServerMatchClient(() => {}, true);
  try {
    const signal = new AbortController().signal;
    await assert.rejects(
      client.rank("private", "goal", "", signal),
      /Couldn’t finish/,
    );
    const next = await client.rank("private", "goal", "", signal);
    assert.equal(next.engine, "lexical");
    assert.equal(requests, 2);
  } finally {
    client.dispose();
    globalThis.fetch = previous;
  }
});
