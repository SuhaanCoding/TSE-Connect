import test from "node:test";
import assert from "node:assert/strict";
import { createScrapeService } from "../lib/scrape.ts";

const url = "https://www.linkedin.com/in/jordan-lee/";
const url2 = "https://www.linkedin.com/in/sam-rivera/";
const at = "2026-11-10T06:00:00Z";
const profile = {
  profileUrl: url,
  about: "Distributed systems",
  currentPosition: { companyName: "Acme" },
};
function fixture() {
  const tables = {
    alumni: [
      {
        id: "one",
        full_name: "Jordan Lee",
        linkedin_url: url,
        bio: "Keep my bio",
        keywords: ["Keep my keywords"],
      },
      { id: "two", full_name: "Sam Rivera", linkedin_url: url2 },
    ],
    scrape_runs: [
      {
        id: "run",
        status: "running",
        provider: "primary",
        apify_run_id: "primary",
        apify_dataset_id: "data-primary",
        input_urls: [url, url2],
        profile_results: [],
        primary_processed_at: null,
        recovery_run_id: null,
        recovery_requested_at: null,
        processing_started_at: null,
      },
    ],
  };
  const writes = [];
  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.patch = null;
      this.row = null;
    }
    select() {
      return this;
    }
    eq(key, value) {
      this.filters.push((row) => row[key] === value);
      return this;
    }
    or() {
      this.filters.push(
        (row) =>
          !row.processing_started_at ||
          new Date(row.processing_started_at) < new Date(Date.now() - 300000),
      );
      return this;
    }
    insert(row) {
      this.row = row;
      return this;
    }
    update(patch) {
      this.patch = patch;
      return this;
    }
    async execute(single = false) {
      if (this.row) {
        if (tables.scrape_runs.some((r) => r.status === "running"))
          return { data: null, error: { code: "23505" } };
        const row = { ...this.row, id: "reserved" };
        tables[this.table].push(row);
        return { data: single ? row : [row], error: null };
      }
      const rows = tables[this.table].filter((row) =>
        this.filters.every((filter) => filter(row)),
      );
      if (this.patch)
        for (const row of rows) {
          if (this.table === "alumni") writes.push({ ...this.patch });
          Object.assign(row, this.patch);
        }
      return {
        data: single ? structuredClone(rows[0] || null) : structuredClone(rows),
        error: null,
      };
    }
    single() {
      return this.execute(true);
    }
    maybeSingle() {
      return this.execute(true);
    }
    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }
  const db = { from: (table) => new Query(table) };
  let starts = 0,
    results = 0,
    recoveryDone = false,
    failRead = false;
  const api = {
    getRunStatus: async (id) => ({
      status: id === "recovery" && !recoveryDone ? "RUNNING" : "SUCCEEDED",
      datasetId: id === "recovery" ? "data-recovery" : "data-primary",
      statusMessage: null,
    }),
    getRunResults: async (id) => {
      results++;
      if (failRead) {
        failRead = false;
        throw new Error("Temporary network failure");
      }
      return id === "data-primary"
        ? [profile]
        : [
            {
              type: "profile",
              inputUrl: url2,
              linkedinUrl: url2,
              company: "Northstar",
              currentPositions: [{ company: "Northstar" }],
              about: "Climate research",
            },
          ];
    },
    getRunInputUrls: async () => [url, url2],
    startScrapeRun: async () => {
      starts++;
      return { runId: "primary", datasetId: "data-primary" };
    },
    startRecoveryRun: async () => {
      starts++;
      return { runId: "recovery", datasetId: "data-recovery" };
    },
  };
  const service = createScrapeService({ connect: async () => db, api });
  return {
    tables,
    writes,
    api,
    service,
    get starts() {
      return starts;
    },
    get reads() {
      return results;
    },
    finishRecovery() {
      recoveryDone = true;
    },
    failNextRead() {
      failRead = true;
    },
  };
}

test("a primary failure is retried once; repeated callbacks cannot start duplicate actors or rewrite completed data", async () => {
  const f = fixture();
  await f.service.processApifyResults("data-primary", "run");
  assert.equal(f.starts, 1);
  assert.equal(f.tables.scrape_runs[0].status, "running");
  assert.equal(f.tables.scrape_runs[0].unresolved_count, 1);
  await f.service.processApifyResults("data-primary", "run");
  assert.equal(f.starts, 1);
  f.finishRecovery();
  await f.service.processApifyResults("data-recovery", "run");
  assert.equal(f.tables.scrape_runs[0].status, "completed");
  assert.equal(f.tables.scrape_runs[0].updated, 2);
  assert.equal(f.tables.scrape_runs[0].unresolved_count, 0);
  const writes = f.writes.length,
    reads = f.reads;
  await f.service.processApifyResults("data-recovery", "run");
  assert.equal(f.writes.length, writes);
  assert.equal(f.reads, reads);
  assert.equal(f.tables.alumni[0].bio, "Keep my bio");
  assert.deepEqual(f.tables.alumni[0].keywords, ["Keep my keywords"]);
});

test("transient failures release the lease and preserve progress for a later retry", async () => {
  const f = fixture();
  f.failNextRead();
  await assert.rejects(
    () => f.service.processApifyResults("data-primary", "run"),
    /Temporary network failure/,
  );
  assert.equal(f.tables.scrape_runs[0].processing_token, null);
  assert.equal(f.tables.scrape_runs[0].status, "running");
  assert.equal(f.writes.length, 0);
  await f.service.processApifyResults("data-primary", "run");
  assert.equal(f.starts, 1);
});

test("an active lease prevents a competing delivery from importing or starting recovery", async () => {
  const f = fixture();
  Object.assign(f.tables.scrape_runs[0], {
    processing_token: "someone-else",
    processing_started_at: new Date().toISOString(),
  });
  await f.service.processApifyResults("data-primary", "run");
  assert.equal(f.starts, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.reads, 0);
});

test("unrelated datasets are rejected before an import and overlapping starts cost nothing", async () => {
  const f = fixture();
  await assert.rejects(
    () => f.service.processApifyResults("unrelated", "run"),
    /does not belong/,
  );
  await assert.rejects(
    () => f.service.createTrackedScrape([url], "manual"),
    /already running/,
  );
  assert.equal(f.starts, 0);
  assert.equal(f.writes.length, 0);
});

test("an unconfirmed recovery request is not blindly repeated", async () => {
  const f = fixture();
  const run = f.tables.scrape_runs[0];
  Object.assign(run, {
    primary_processed_at: at,
    recovery_requested_at: at,
    profile_results: [
      {
        inputUrl: "linkedin.com/in/jordan-lee",
        name: "Jordan Lee",
        alumniIds: ["one"],
        status: "unavailable",
        source: "primary",
        fields: [],
        reason: "Hidden",
      },
    ],
  });
  await f.service.processApifyResults("data-primary", "run");
  assert.equal(f.starts, 0);
  assert.equal(run.unresolved_count, 1);
  assert.equal(run.status, "failed");
  assert.match(run.error_message, /not confirmed/);
});
