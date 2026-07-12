# TASK-001 — создать TypeScript monorepo и CI

## Цель

Превратить docs-only репозиторий в собираемый TypeScript workspace, в котором приложения и пакеты могут импортировать друг друга через публичные package entry points.

## Перед началом

1. Прочитайте корневой `AGENTS.md` и три архитектурных документа, перечисленных в нём.
2. Убедитесь, что TASK-001 ещё не реализован частично. Не удаляйте и не перезаписывайте чужие изменения.
3. Не выполняйте `git init`. Если репозиторий не распознаётся Git, это не относится к данной задаче.
4. Проверьте наличие Node.js 22 LTS и pnpm 10. Если их нет, остановитесь и сообщите точную отсутствующую зависимость.

## Зафиксированные решения

- Package manager: `pnpm` 10 с workspace-файлом `pnpm-workspace.yaml`.
- Язык production-кода: TypeScript в strict mode.
- Формат модулей: ESM.
- Тесты: Vitest.
- Оркестрация на этой итерации: обычные рекурсивные команды pnpm; Turborepo/Nx не добавлять.
- CI: GitHub Actions на Node.js 22, установка через Corepack и frozen lockfile.
- Каждое приложение и каждый пакет имеет собственный `package.json` и `tsconfig.json`.
- Межпакетные импорты выполняются по package name, а не через `../../packages/...`.

## Что создать

Создайте следующий каркас:

```text
apps/
├── api/
├── editor-web/
└── runtime-demo/
packages/
├── editor-core/
├── exporter/
├── runtime-pixi/
├── schema/
├── shared/
└── validators/
```

Требования к каркасу:

1. Корневой `package.json` объявляет workspace приватным, фиксирует реально использованную полную версию pnpm в `packageManager` и предоставляет scripts `build`, `typecheck`, `test`.
2. `pnpm-workspace.yaml` включает `apps/*` и `packages/*`.
3. Общий strict TypeScript config находится в корне, а локальные configs расширяют его.
4. Каждый каталог из дерева содержит минимальный `src/index.ts` и собирается без ошибок. Заглушки не должны содержать продуктовую логику.
5. Package names используют единый scope `@pixi-ui-editor/*`.
6. Добавьте `.gitignore` для `node_modules`, build output, coverage, local environment files и editor/OS мусора. Не игнорируйте fixtures и lockfile.
7. Создайте lockfile.
8. Добавьте `.github/workflows/ci.yml`, который на push и pull request выполняет установку с `--frozen-lockfile`, затем `typecheck`, `test`, `build`.
9. Добавьте короткий корневой `README.md`: требования к среде и ровно те команды, которые реально работают.

Не подключайте React, PixiJS, серверный framework, DOM tooling или asset pipeline: они не нужны для проверки foundation.

## Порядок выполнения

1. Создайте root workspace files и общий TypeScript config.
2. Создайте все каталоги приложений и пакетов.
3. Настройте public entry point и build для каждого workspace package.
4. Добавьте один минимальный unit test в `packages/shared`, чтобы `pnpm test` действительно запускал тест, а не завершался из-за отсутствия tests.
5. Создайте lockfile.
6. Добавьте CI и корневой README.
7. Запустите проверки из раздела ниже.

## Обязательные проверки

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Каждая команда должна завершиться с кодом `0` на Windows. CI должен выполнять эквивалентные команды на GitHub runner.

## Критерии приёмки

- Все девять workspaces обнаруживаются pnpm: 3 приложения и 6 пакетов.
- У каждого workspace есть buildable TypeScript entry point.
- В production dependencies нет React, PixiJS, Spine, backend framework или ZIP library.
- Корневые команды не зависят от глобально установленного TypeScript/Vitest.
- CI и README используют команды, проверенные локально.
- Существующие документы в `docs/` не переписаны.

## Отчёт исполнителя

В финальном сообщении перечислите созданные workspace, версии Node/pnpm, выполненные команды и их результат. Не заявляйте о готовности TASK-002 или runtime rendering.

