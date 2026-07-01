---
name: executeSql sandbox quirk
description: RETURNING clauses do not surface through the code_execution executeSql callback
---

# executeSql (code_execution sandbox) quirk

`executeSql({ sqlQuery })` in the code_execution sandbox does NOT surface the
output of `INSERT ... RETURNING id` — the returned `.output` for such statements
comes back empty, so parsing an id from it yields `NaN`/null.

**How to apply:** After an INSERT, fetch the id with a follow-up `SELECT id FROM
... WHERE <unique col> = ...`. Output is CSV with a header row plus a trailing
newline, so parse with: split on "\n", trim, filter empty, take the last line.

Also note `process.env` is not available inside the sandbox — to use a secret
(e.g. SESSION_SECRET) for crypto, run a `node -e` script via bash (where env vars
are present) and print only the non-sensitive result (e.g. ciphertext).
