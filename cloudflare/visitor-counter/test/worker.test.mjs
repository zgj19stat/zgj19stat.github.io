import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.mjs";

class MockStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    if (!this.sql.includes("INSERT OR IGNORE INTO visit_sessions")) throw new Error("Unexpected run query");
    const [hash] = this.values;
    const before = this.database.sessions.size;
    this.database.sessions.add(hash);
    const changes = this.database.sessions.size - before;
    this.database.total += changes;
    return { meta: { changes } };
  }

  async first() {
    if (!this.sql.includes("FROM visit_counter")) throw new Error("Unexpected first query");
    return { total: this.database.total, sinceLabel: "Aug 2026" };
  }
}

class MockDatabase {
  constructor() {
    this.sessions = new Set();
    this.total = 0;
  }

  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

function environment() {
  return {
    DB: new MockDatabase(),
    ALLOWED_ORIGINS: "https://zgj19stat.github.io,http://127.0.0.1:4000",
    SINCE_LABEL: "Aug 2026"
  };
}

function visitRequest(session, origin = "https://zgj19stat.github.io") {
  return new Request("https://counter.example/visit", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0"
    },
    body: JSON.stringify({ session })
  });
}

test("records one anonymous visit and treats a retry as idempotent", async () => {
  const env = environment();
  const requestOne = visitRequest("01234567-89ab-cdef-0123-456789abcdef");
  const responseOne = await worker.fetch(requestOne, env);
  assert.equal(responseOne.status, 200);
  assert.deepEqual(await responseOne.json(), { total: 1, since: "Aug 2026", recorded: true });

  const requestTwo = visitRequest("01234567-89ab-cdef-0123-456789abcdef");
  const responseTwo = await worker.fetch(requestTwo, env);
  assert.deepEqual(await responseTwo.json(), { total: 1, since: "Aug 2026", recorded: false });
});

test("rejects writes from an unapproved origin", async () => {
  const response = await worker.fetch(
    visitRequest("01234567-89ab-cdef-0123-456789abcdef", "https://example.com"),
    environment()
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "origin_not_allowed");
});

test("rejects malformed session identifiers", async () => {
  const response = await worker.fetch(visitRequest("short"), environment());
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid_session");
});

test("returns the current total without incrementing it", async () => {
  const env = environment();
  env.DB.total = 42;
  const response = await worker.fetch(
    new Request("https://counter.example/count", {
      headers: { Origin: "https://zgj19stat.github.io" }
    }),
    env
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { total: 42, since: "Aug 2026" });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://zgj19stat.github.io");
});
