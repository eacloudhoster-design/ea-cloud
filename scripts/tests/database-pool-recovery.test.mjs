import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawnSync } from "node:child_process";
import {
  createDatabasePool,
  databaseErrorCode,
  withPoolClient,
} from "../../lib/db/src/pool.ts";
import { drizzle } from "../../lib/db/node_modules/drizzle-orm/node-postgres/index.js";

const packet = (type, payload) => {
  const size = Buffer.alloc(4);
  size.writeInt32BE(payload.length + 4);
  return Buffer.concat([Buffer.from(type), size, payload]);
};
const ready = () => packet("Z", Buffer.from("I"));
// Minimal loopback PostgreSQL wire peer, exercising the real installed pg and
// pg-pool drivers. No production URL, schema, accounts or keys are used.
async function peer() {
  const sockets = new Set();
  let stall = false,
    fail = "";
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let data = Buffer.alloc(0),
      startup = true;
    socket.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
      while (data.length >= (startup ? 4 : 5)) {
        const size = data.readInt32BE(startup ? 0 : 1),
          total = size + (startup ? 0 : 1);
        if (data.length < total) return;
        const type = startup ? "startup" : String.fromCharCode(data[0]);
        const query = startup
          ? ""
          : data
              .subarray(5, total - 1)
              .toString()
              .toLowerCase();
        data = data.subarray(total);
        if (startup) {
          startup = false;
          socket.write(Buffer.concat([packet("R", Buffer.alloc(4)), ready()]));
        } else if (type === "Q" && !stall) {
          if (query === fail) {
            fail = "";
            socket.write(
              Buffer.concat([
                packet(
                  "E",
                  Buffer.from(
                    "SERROR\0C08006\0MPRIVATE simulated database failure\0\0",
                  ),
                ),
                ready(),
              ]),
            );
          } else
            socket.write(
              Buffer.concat([packet("C", Buffer.from("SELECT 1\0")), ready()]),
            );
        } else if (type === "X") socket.end();
      }
    });
    socket.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    sockets,
    server,
    setStall: (value) => {
      stall = value;
    },
    failNext: (value) => {
      fail = value;
    },
    url: `postgres://test@127.0.0.1:${server.address().port}/test`,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}

test("baseline unhandled idle pool error terminates Node", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import pg from './lib/db/node_modules/pg/lib/index.js';new pg.Pool().emit('error',Object.assign(Error('idle socket lost'),{code:'ECONNRESET'}));`,
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Emitted 'error' event on BoundPool/);
});

test("idle database disconnection is evicted, sanitized and reconnects without restarting", async () => {
  const db = await peer(),
    pool = createDatabasePool(db.url),
    records = [];
  const previous = console.error;
  console.error = (record) => records.push(record);
  try {
    await pool.query("SELECT 1");
    assert.equal(pool.idleCount, 1);
    const failure = new Promise((resolve) => pool.once("error", resolve));
    for (const socket of db.sockets) socket.destroy();
    await failure;
    assert.equal(pool.totalCount, 0);
    await pool.query("SELECT 1");
    assert.equal(pool.idleCount, 1);
    assert.equal(
      JSON.parse(records[0]).event,
      "database_idle_connection_failed",
    );
    assert.ok(!records.join("").includes(db.url));
    pool.emit(
      "error",
      Object.assign(Error("PRIVATE SQL password"), {
        code: "ECONNRESET",
        client: { password: "PRIVATE" },
      }),
    );
    assert.ok(!records.join("").includes("PRIVATE"));
  } finally {
    console.error = previous;
    await pool.end();
    await db.close();
  }
});

test("saturated checkout times out, removes its waiter and recovers on release", async () => {
  const db = await peer(),
    pool = createDatabasePool(db.url);
  pool.options.max = 1;
  pool.options.connectionTimeoutMillis = 40;
  try {
    const held = await pool.connect();
    await assert.rejects(pool.query("SELECT 1"), /timeout exceeded/);
    assert.equal(pool.waitingCount, 0);
    held.release();
    await pool.query("SELECT 1");
    assert.equal(pool.idleCount, 1);
  } finally {
    await pool.end();
    await db.close();
  }
});

test("non-responsive query fails and its connection is removed; subsequent query reconnects", async () => {
  const db = await peer(),
    pool = createDatabasePool(db.url);
  pool.options.query_timeout = 40;
  try {
    db.setStall(true);
    await assert.rejects(pool.query("SELECT 1"), /timeout/);
    assert.equal(pool.totalCount, 0);
    db.setStall(false);
    await pool.query("SELECT 1");
    assert.equal(pool.idleCount, 1);
  } finally {
    await pool.end();
    await db.close();
  }
});

test("production pool bounds and sanitized driver codes", async () => {
  const pool = createDatabasePool("postgres://test@127.0.0.1:1/test");
  assert.equal(pool.options.connectionTimeoutMillis, 10000);
  assert.equal(pool.options.statement_timeout, undefined);
  assert.equal(pool.options.query_timeout, 65000);
  assert.equal(pool.options.max, 10);
  assert.equal(databaseErrorCode({ code: "password=PRIVATE" }), "UNKNOWN");
  await pool.end();
});

test("baseline Drizzle leaks the checkout on failed BEGIN", async () => {
  const db = await peer(),
    pool = createDatabasePool(db.url);
  let checkedOut;
  pool.once("acquire", (client) => {
    checkedOut = client;
  });
  try {
    db.failNext("begin");
    await assert.rejects(
      drizzle(pool).transaction(async () => {}),
      (error) => error.cause?.code === "08006",
    );
    assert.equal(pool.totalCount, 1);
    assert.equal(pool.idleCount, 0);
  } finally {
    checkedOut?.release(true);
    await pool.end();
    await db.close();
  }
});

test("outer transaction ownership recovers from repeated BEGIN, COMMIT and ROLLBACK failures", async () => {
  const db = await peer(),
    pool = createDatabasePool(db.url);
  pool.options.max = 1;
  pool.options.connectionTimeoutMillis = 100;
  const transaction = (run) =>
    withPoolClient(pool, (client) => drizzle(client).transaction(run));
  try {
    for (let i = 0; i < 12; i++) {
      db.failNext("begin");
      await assert.rejects(
        transaction(async () => {}),
        (error) => error.cause?.code === "08006",
      );
      assert.equal(pool.totalCount, 0);
      assert.equal(pool.waitingCount, 0);
    }
    db.failNext("commit");
    await assert.rejects(
      transaction(async () => {}),
      (error) => error.cause?.code === "08006",
    );
    assert.equal(pool.totalCount, 0);
    db.failNext("rollback");
    await assert.rejects(
      transaction(async () => {
        throw Error("cancelled");
      }),
      (error) => error.cause?.code === "08006",
    );
    assert.equal(pool.totalCount, 0);
    await assert.rejects(
      transaction(async () => {
        throw Error("access denied");
      }),
      /access denied/,
    );
    assert.equal(pool.totalCount, 0);
    assert.equal(await transaction(async () => 42), 42);
    assert.equal(pool.idleCount, 1);
    // Nested savepoints retain the same checkout and return it just once.
    await transaction((tx) => tx.transaction(async () => {}));
    assert.equal(pool.idleCount, 1);
  } finally {
    await pool.end();
    await db.close();
  }
});
