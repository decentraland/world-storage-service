# Player command capture for migration rehearsals

This optional adapter records accepted player-value commands for the production → dcl-one follower, including authoritative multiplayer calls that bypass the public gateway. It does not copy player rows continuously or run gameplay twice. World values, env values and collaborator projections are outside this adapter.

`MIGRATION_PLAYER_CAPTURE_ENABLED` defaults to `false`. When enabled, existing authenticated player setters, deletes, per-player clears and scene-wide clears use the transactional `migration_player_capture.apply_command` function. Quota validation remains in the existing source operation. The function persists the command and its source mutation together, including no-op deletes/clears, without connecting to the target. The exact serialized value and source timestamps are retained; original delegation credentials are not retained.

## Installation and activation

Use a disposable rehearsal source first. The installer needs DDL ownership; the service and capture reader must use separate restricted roles. The application role must not own the capture schema or alter its tables/functions/triggers.

1. Pause **all** player writers. Deploy this code to every writer and keep traffic paused while installing the adapter and enabling the flag. A rolling mix of flag-off/old and opted-in writers is unsupported: capture ordering must be acquired before the existing quota lock, and old writers acquire those locks in the opposite order.
2. In one transaction, execute [hybrid-player-capture.sql](hybrid-player-capture.sql), insert the reviewed immutable `(world_name, place_id, scene_id)` scope, and call `migration_player_capture.seal_scope()`. Use canonical lowercase world names, nonnil place UUIDs and the accepted scene entity identity. Empty or more than 1,000 scopes are refused. Genesis namespaces and namespace remapping are not supported by this bounded contract.
3. Grant the application role `USAGE` on `migration_player_capture` and `EXECUTE` on **only** `lock_capture()` and `apply_command(text,text,uuid,text,text,text,text)`. Grant the capture reader `USAGE` and `SELECT` on `control`, `scope` and `transactions`; it needs no mutation or function privileges. The script revokes public permissions. The dcl-one installer performs equivalent installation; do not run both installers on one source.
4. Establish and verify the follower baseline at the source capture boundary using the dcl-one migration worker. Scope and generation cannot be changed in place once capture begins. Keep the target isolated from normal jobs, providers and public writes.
5. Set `MIGRATION_PLAYER_CAPTURE_ENABLED=true` on every source application instance, then resume writers. Measure capture-lock contention, outbox growth and lag before any broader use.

There is no startup installation, automatic privilege grant, target URL or target credential in this service. SQL installation and application configuration are separate explicit actions.

## Failure behavior and boundaries

- Unknown/direct SQL writes into selected scopes commit their normal source effects and record `unclassified=true`; the follower must stop at that transaction. They are never silently converted to row replication.
- Missing or mismatched scene metadata also preserves the source write and marks the transaction unclassified. It does not alter existing source authorization or reject legitimate administration requests merely to fit migration. Such callers need a reviewed acceptance contract before their scope can continue.
- Multiple accepted commands in one source transaction are unsupported and mark that transaction unclassified. The current HTTP paths each execute one command.
- Installed capture rejects `TRUNCATE`, which cannot be represented by the bounded command contract. Scope changes are rejected after sealing. Schema changes or additional triggers need compatibility review.
- PostgreSQL captures only committed mutations. A database failure rolls back the mutation and receipt together. Cache invalidation retains the existing post-write/post-commit behavior.
- Do not disable the flag or remove the capture schema while writers are active. First pause writers, drain/verify the follower boundary, and complete the reviewed cutover or abort procedure. No automatic pruning/reset is supplied; retain evidence for the recovery horizon.

## Validation

The ordinary unit suite checks opt-in/default behavior, command forwarding and capture-before-quota lock order. The PostgreSQL regression suite creates and drops isolated databases on an explicitly supplied disposable server (requires `psql` and `CREATEDB` permission):

```sh
MIGRATION_PLAYER_TEST_DATABASE_URL='<DISPOSABLE_POSTGRES_URL>' \
  node_modules/.bin/jest --runInBand test/integration/migration/player-capture.spec.ts
```

Without that variable these database tests are skipped. They cover atomic rollback, no-op commands, clear evidence, direct SQL writers, missing scene identity, scope immutability and malformed operations. They do not establish deployed ingress, production contention, source failover or end-to-end target conformance.
