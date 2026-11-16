# Common rules for every builder

Read `docs/ARCHITECTURE.md` and `packages/protocol/src/index.ts` first. They are the contract.

- Work ONLY inside the package directories assigned to you. Other agents are editing sibling
  packages at the same time. Never edit `packages/protocol`, root files, or `docs/` (except your
  own `docs/notes/<package>.md` if you need to record a decision or a contract change request).
- Do not write to git history or the index (no staging, no committing). Do not run a root-wide
  `pnpm install` while others work: add dependencies to your own package.json and run
  `pnpm install --filter <your-package>...` from the repo root.
- TypeScript strict, ESM (`"type": "module"`, NodeNext, `.js` extensions in relative imports),
  named exports only, 4-space indentation, max line length 144.
- NO comments in code. Names carry the meaning.
- Each package: `package.json` (name `@tvemu/<dir>`, scripts `build` = `tsc -p tsconfig.json`,
  `typecheck`, `test` = `vitest run`), `tsconfig.json` extending `../../tsconfig.base.json`
  (copy `packages/protocol/tsconfig.json`), sources in `src/`, tests as `src/**/*.test.ts` (Vitest).
  Depend on the contract with `"@tvemu/protocol": "workspace:*"`.
- Clean-room: `docs/re/*.md` are behavioural notes from static analysis of Samsung's SDK. Implement
  from them. Never copy Samsung code or assets; never read `_samsung-tv-sdk-ref` yourself.
- No credentials or tokens anywhere.
- Finish with: `pnpm --filter <pkg> run build` and `pnpm --filter <pkg> run test` both green, and
  a final message listing files created, test results (real output), and anything not verified.
- This Mac is Apple Silicon (arm64) on macOS 27 with Rosetta 2 working.
