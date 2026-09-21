# Contributor / agent notes

## Package manager: classic yarn (v1)

The committed `yarn.lock` is classic **yarn-1** format (`# yarn lockfile v1`). yarn Berry (v2+)
silently rewrites it to Berry format on any `yarn` / `yarn add`, which breaks CI (CI installs with
classic yarn). Update dependencies with classic yarn:

- `npx --yes yarn@1.22.22 install` (or `yarn@1.22.22 add -E pkg@x.y.z` to bump), then confirm
  `head -2 yarn.lock` still reads `# yarn lockfile v1`.
- If your global `yarn` is Berry, run every script via `npx --yes yarn@1.22.22 <script>`.
- Never commit `.yarn/` or `.yarnrc.yml` (local Berry artifacts).

A `resolutions` override pins `@dcl/core-commons` tree-wide because `@dcl/http-commons` and
`@dcl/crypto-middleware` still constrain it to `^0.10.0`; drop it once they publish `^0.11.0` builds.

## Tests

- `yarn test` runs unit + integration **serially** — integration specs bind a fixed port 3000, so
  they cannot run in parallel. `--detectOpenHandles` forces `--runInBand`; running
  `jest test/integration` directly needs `--runInBand` too, or you hit `EADDRINUSE :3000`.
- `yarn test:sqs` runs the real-SQS ingestion tests against the docker-compose localstack queue
  (`docker compose up -d localstack` first). They are gated behind `RUN_SQS_INTEGRATION=true` and
  skipped by default, so the shared CI (which has no localstack) stays green.
- The ingestion spec creates its **queue per run** (`world-storage-deployments-${Date.now()}`) and
  deletes it in `afterAll`. Do not revert to a fixed queue name: `--forceExit` kills the process
  while messages are still in flight, and SQS makes them visible again ~60s later, where they
  replay into the next run and overwrite its index rows with the previous run's wallet.
  `PurgeQueue` cannot fix this — SQS rate-limits it to one call per minute and it cannot reach
  in-flight messages at all.
- The suite needs postgres on `PG_COMPONENT_PSQL_HOST/PORT` (`.env.default` points at 5432). If that
  port is taken, run postgres anywhere and pass `PG_COMPONENT_PSQL_PORT=<port>` to the test command.
- `node-pg-migrate` does **not** read the `PG_COMPONENT_PSQL_*` vars — it wants `DATABASE_URL`.
  Without it the migration fails with `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a
  string`, which reads like a credentials bug rather than a missing variable:
  `DATABASE_URL=postgres://postgres:pass1234@localhost:5433/world_storage npx node-pg-migrate ...`
