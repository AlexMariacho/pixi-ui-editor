# TASK-003 — добавить sample project, deterministic serialization и loader smoke-test

## Зависимость

TASK-001 и TASK-002 должны быть завершены. Перед изменениями выполните `pnpm typecheck`, `pnpm test` и `pnpm build`.

## Цель

Доказать критерий выхода Этапа 0: хранящийся в репозитории документ проходит migration/validation и загружается кодом будущего runtime. PixiJS rendering в этой задаче не реализуется.

## Часть A — эталонный sample project

Добавьте version-controlled fixture в `examples/sample-project/`.

Fixture должен содержать:

- один project со stable UUID;
- одну scene со stable UUID;
- одну общую hierarchy;
- root `container`;
- дочерние `image` и `text`;
- один image asset record и ссылку на него по `assetId`;
- один generic binding на UI node;
- обязательные reference viewport `desktop` и `mobile`;
- минимум один mobile transform/layout override, не копирующий node;
- source metadata ассета, но fixture не обязан содержать реальный бинарный image file.

Все UUID задайте явными константами, чтобы fixture и snapshot tests были стабильны. Name не используйте ни в одной ссылке.

Также создайте небольшие отдельные invalid fixtures либо программные mutations для проверки:

- broken asset reference;
- duplicate binding;
- отсутствующий `mobile` profile;
- hierarchy cycle.

Не копируйте полный sample JSON четыре раза, если достаточно клонировать валидный fixture и изменить одно поле в тесте.

## Часть B — детерминированная сериализация

В `@pixi-ui-editor/schema` добавьте публичную функцию:

```ts
function serializeProjectDocument(document: ProjectDocument): string;
```

Она обязана:

1. сначала полностью валидировать документ;
2. выдавать JSON с фиксированным порядком object keys;
3. сохранять семантический порядок массивов hierarchy;
4. одинаково обрабатывать конечные числа и отклонять `NaN`/`Infinity` через validation;
5. завершать файл одним newline;
6. не изменять входной объект.

Два вызова для логически одинакового документа с разным порядком object keys должны вернуть byte-for-byte одинаковую строку.

## Часть C — минимальный document loader

В `@pixi-ui-editor/runtime-pixi` реализуйте только headless loading boundary:

```ts
function loadProjectDocument(input: unknown): ProjectDocument;
function parseProjectDocumentJson(json: string): ProjectDocument;
```

Обе функции используют migration и validation из `@pixi-ui-editor/schema`. Они не должны дублировать schema, semantic validation или migration logic. JSON parse error и schema error должны быть различимы вызывающим кодом.

Не импортируйте PixiJS и не создавайте display objects. Название пакета отражает будущего consumer, но текущая задача проверяет только границу загрузки.

## Часть D — ADR

Добавьте `docs/adr/0001-foundation-boundaries.md` со статусом `Accepted`. Коротко зафиксируйте уже реализованные решения:

- canonical document — декларативный normalized JSON, не PixiJS tree;
- `@pixi-ui-editor/schema` владеет types, runtime schema, migrations и serialization;
- editor и runtime являются consumers одного контракта;
- stable UUID отделён от display name;
- assets отделены от nodes;
- одна hierarchy обслуживает `desktop` и `mobile` через overrides;
- backend и publish не являются source of truth на prototype stage;
- gameplay behavior остаётся вне document/runtime core.

ADR не должен придумывать prefab resolution, layout solver или asset version policy: эти решения пока не реализованы и требуют отдельных ADR.

## Тесты

Добавьте integration/smoke tests, которые:

1. читают настоящий sample JSON с диска;
2. загружают его через `parseProjectDocumentJson`;
3. проверяют scene ID, общий root ID, image asset reference, generic binding и наличие обоих profiles;
4. сериализуют документ, повторно загружают результат и сравнивают данные;
5. доказывают byte-for-byte deterministic serialization;
6. отклоняют каждый invalid case с ожидаемым validation code;
7. отличают malformed JSON от валидного JSON с невалидным document.

Тест не должен использовать browser, canvas, network или реальный asset server.

## Документация

Обновите корневой README одной короткой секцией с командой запуска smoke test и ссылкой на sample project. Не дублируйте там schema specification.

## Обязательные проверки

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Дополнительно запустите конкретный smoke test командой, указанной в README.

## Критерии приёмки

- Sample document хранится в репозитории и читается тестом с диска.
- Loader вызывает shared migration/validation, а не собственную упрощённую проверку.
- Sample содержит одну hierarchy и два profile records, а не две scene copies.
- Изменение display name в тесте не ломает references.
- Serialization детерминирована и не сортирует массив `children`, потому что его порядок семантически значим.
- ADR описывает только принятые в этой итерации решения.
- Все обязательные команды завершаются с кодом `0`.

## Отчёт исполнителя

Укажите путь к sample, путь к ADR, публичные loader/serialization functions, проверенные invalid cases и результаты команд. Не заявляйте, что runtime уже отображает UI: rendering начинается в следующей итерации.

