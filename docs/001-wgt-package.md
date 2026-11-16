# WGT package delivery

Implemented the WGT manifest/archive/app-store package using protocol types, namespace-aware XML parsing, lazy ZIP reads and staged filesystem publication so the host can manage Tizen web apps. Evidence: package build and typecheck exited 0; 34 Vitest tests passed in one file; V8 statement/line coverage 98.72%, branches 92.48%, functions 100%. QA approved after dual review. Crash durability, external-reader uninterrupted replacement and publication/rollback fault injection were not verified.

## Scope and solution
All implementation resides in packages/wgt: package.json, tsconfig.json, src/index.ts, src/manifest.ts, src/archive.ts, src/store.ts, src/wgt-error.ts, src/wgt.test.ts. Protocol was consumed unchanged. XML maps widget/Tizen namespaces and preserves Unicode and hosted content URLs. Archives expose manifest/inspection data and reject unsafe paths and symlinks. Store operations serialize per home, stage content/metadata, replace prior installations and preserve metadata across store instances.

## Verification
- pnpm --filter @tvemu/wgt run build: exit 0.
- pnpm --filter @tvemu/wgt run typecheck: exit 0.
- pnpm --filter @tvemu/wgt run test: 1 file passed, 34 tests passed, duration 406ms.
- Coverage: statements/lines 98.72%, branches 92.48%, functions 100%.
- Independent QA verdict: APPROVED.

## Limits and orchestration exceptions
Replacement uses two renames with rollback, not an OS atomic exchange. External readers can observe a short absent path and process crashes can leave staging/backup. Backup cleanup errors after publication are not fault-injected. No signature verification is performed, as required. Developer-mandated planning, agent memory and this delivery document are root metadata exceptions; dependency setup also generated a root .pnpm-store cache. No git index/history changes were made.
