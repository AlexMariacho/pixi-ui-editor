# TASK-002 — реализовать schema v0, stable ID, validation и migrations

## Зависимость

TASK-001 должна быть завершена. Перед изменениями запустите `pnpm typecheck`, `pnpm test` и `pnpm build`. Если базовые проверки падают, сначала опишите проблему и не маскируйте её изменениями schema.

## Цель

Создать единственный типизированный контракт `ProjectDocument` версии `0`, пригодный одновременно для editor, validators и runtime. Контракт не должен содержать объекты PixiJS или игровую семантику.

## Зафиксированные решения

- Source of truth для runtime schema и TypeScript types находится только в `packages/schema`.
- Для runtime-описания schema используйте TypeBox, для проверки — Ajv. Не поддерживайте вручную две независимые версии одних и тех же полей.
- `schemaVersion` первой версии равна числу `0`.
- ID генерируются через `crypto.randomUUID()` и валидируются как UUID. Name, array index и hierarchy path не являются identity.
- Node и Asset — разные сущности; node ссылается на asset только через `assetId`.
- Сцена содержит одну hierarchy. `desktop` и `mobile` хранят только presentation overrides и не содержат копии nodes.
- Значения binding — непрозрачные пользовательские строки. Запрещены встроенные значения с gameplay-смыслом.
- Неизвестная версия документа не принимается автоматически.

## Публичный API `@pixi-ui-editor/schema`

Экспортируйте как минимум:

```ts
type ProjectDocument;
type Scene;
type UINode;
type Asset;
type PrefabDefinition;
type LayoutProfileId = "desktop" | "mobile";

const CURRENT_SCHEMA_VERSION: 0;
const ProjectDocumentSchema;

function createStableId(): string;
function validateProjectDocument(input: unknown): ValidationResult;
function assertProjectDocument(input: unknown): asserts input is ProjectDocument;
function migrateProjectDocument(input: unknown): ProjectDocument;
```

`ValidationResult` обязан содержать `valid` и массив структурированных issues. У каждого issue должны быть минимум `code`, `path`, `message` и severity `error | warning`. Не возвращайте только строку Ajv.

## Минимальная модель документа

Опишите поля, необходимые для следующих сущностей:

- `ProjectDocument`: `schemaVersion`, project metadata, `settings`, `assets`, `prefabs`, `scenes`;
- project metadata: stable `id` и display `name`;
- settings: `layoutProfileSelection` с режимом `aspect-ratio` и числовым `mobileMaxAspectRatio`;
- `Scene`: stable `id`, display `name`, root node IDs, nodes и layout settings;
- layout settings: ровно два обязательных reference viewport — `desktop` и `mobile`;
- `UINode`: stable `id`, display `name`, discriminant `type`, `parentId`, ordered `children`, `visible`, transform, optional layout overrides, optional binding;
- node types schema v0: `container`, `image`, `text`, `spine`, `prefab-instance`;
- `Image` ссылается на asset через `assetId`; `Spine` — через `assetId`; `PrefabInstance` — через `prefabId`;
- `Asset`: stable `id`, display `name`, type и source metadata; source не определяется именем файла;
- `PrefabDefinition`: stable `id`, display `name`, собственная hierarchy и список разрешённых exposed properties.

Не добавляйте behavior graph, timeline, готовые controls, arbitrary breakpoints или сериализованные PixiJS classes.

## Смысловая validation

Помимо JSON Schema проверки реализуйте проверки, которые невозможно надёжно выразить только типами:

1. все entity IDs уникальны в пределах документа;
2. каждый root/node/child/parent reference существует;
3. parent и children согласованы;
4. hierarchy не содержит циклов и один node не принадлежит двум parents;
5. ссылки `assetId` и `prefabId` существуют и указывают на совместимый тип;
6. binding не пустой после trim и не дублируется в пределах materialized scene;
7. у каждой сцены существуют reference viewport для `desktop` и `mobile`, их width/height положительны;
8. profile overrides используют только `desktop` или `mobile`;
9. `mobileMaxAspectRatio` — конечное положительное число;
10. неизвестные обязательные discriminants и неизвестная `schemaVersion` дают error.

Разделите structural errors и semantic errors стабильными `code`, чтобы UI позже мог отображать их без разбора текста сообщения.

## Migration entry point

`migrateProjectDocument` должен:

1. принять `unknown`;
2. определить `schemaVersion`;
3. для версии `0` вернуть валидный независимый объект версии `0` без изменения входного объекта;
4. для отсутствующей, отрицательной, дробной или неизвестной версии выбросить типизированную ошибку;
5. после migration запустить полную validation.

Это intentionally no-op migration, но единая точка входа должна существовать с первой версии.

## Тесты

Добавьте unit tests минимум на:

- UUID generation и независимость ID от name;
- минимально валидный документ;
- отсутствие `mobile` или `desktop` reference viewport;
- duplicate ID;
- missing child, asset и prefab reference;
- рассогласованные parent/children;
- hierarchy cycle;
- duplicate binding;
- неизвестный layout profile key;
- неизвестную `schemaVersion`;
- no-op migration без мутации исходного объекта.

## Обязательные проверки

```powershell
pnpm typecheck
pnpm test
pnpm build
```

## Критерии приёмки

- Другие workspaces импортируют schema только через `@pixi-ui-editor/schema`.
- JSON-compatible document не содержит functions, class instances и PixiJS objects.
- Rename entity не требует менять ссылки.
- Desktop/mobile используют одну hierarchy и общие stable IDs.
- Ошибки validation имеют стабильный machine-readable code и точный path.
- Все негативные тесты падают по ожидаемой причине, а не из-за случайной другой ошибки.

## Отчёт исполнителя

Перечислите публичные exports, validation codes, добавленные тест-кейсы и результаты трёх обязательных команд. Не расширяйте отчёт планом editor UI.

