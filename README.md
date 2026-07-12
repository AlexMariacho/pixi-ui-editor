# Pixi UI Editor

TypeScript monorepo for the Pixi UI Editor foundation.

## Requirements

- Node.js 22 LTS
- pnpm 10 (available through Corepack)

## Commands

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

## Sample project smoke test

The version-controlled [sample project](examples/sample-project/project.json) is loaded through the headless runtime boundary by the smoke test:

```powershell
pnpm --filter @pixi-ui-editor/runtime-pixi test
```
