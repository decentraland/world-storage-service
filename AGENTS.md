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
