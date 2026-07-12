# Итерация 01 — технический foundation

## Зачем нужна эта итерация

Итерация создаёт минимальную исполняемую основу проекта до начала разработки editor UI. После неё в репозитории должен существовать один версионируемый декларативный формат документа, который одинаково доступен будущему редактору и PixiJS runtime.

Это реализация **Этапа 0** из [плана MVP](../../game-ui-platform-implementation-plan-mvp-v3.md). Итерация не пытается реализовать весь demo vertical slice.

## Демонстрируемый результат

Одна команда устанавливает зависимости, проверяет типы, запускает тесты и собирает workspace. Эталонный JSON-документ:

1. содержит одну общую hierarchy и оба обязательных layout-профиля — `desktop` и `mobile`;
2. проходит структурную и смысловую validation;
3. проходит через migration entry point;
4. загружается тестовым кодом из `runtime-pixi` без PixiJS rendering;
5. детерминированно сериализуется.

## Задачи и порядок выполнения

Задачи выполняются строго последовательно. Исполнитель следующей задачи сначала запускает проверки предыдущей.

1. [TASK-001 — создать TypeScript monorepo и CI](TASK-001-monorepo.md)
2. [TASK-002 — реализовать schema v0, stable ID, validation и migrations](TASK-002-schema-v0.md)
3. [TASK-003 — добавить sample project, deterministic serialization и loader smoke-test](TASK-003-sample-and-loader.md)

## Общий Definition of Done

Итерация завершена только если одновременно выполнены все условия:

- из чистого checkout выполняются документированные команды установки;
- `pnpm typecheck`, `pnpm test` и `pnpm build` завершаются с кодом `0`;
- CI запускает те же три проверки;
- валидный fixture проходит validation и загрузку;
- намеренно повреждённые fixtures доказывают проверки hierarchy, ссылок, bindings и обоих layout-профилей;
- неизвестная `schemaVersion` отклоняется с понятной ошибкой;
- повторная сериализация одного документа даёт одинаковый результат;
- в production-коде нет editor-specific или gameplay-specific семантики.

## Не входит в итерацию

- визуальный editor shell;
- PixiJS canvas и создание display objects;
- runtime-demo в браузере;
- загрузка реальных изображений или Spine;
- backend, autosave, publish и ZIP export;
- prefab resolution;
- layout solver, anchors и расчёт breakpoint;
- дополнительные layout-профили помимо `desktop` и `mobile`.

Если для выполнения задачи приходится реализовывать что-либо из этого списка, остановитесь: scope выбран неверно.

