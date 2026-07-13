# TASK-009 — добавление/удаление nodes, autosave в localStorage, ADR 0002

## Зависимость

TASK-008 завершена. Сначала выполните её проверки, включая визуальную.

## Цель

Пользователь может собрать простой экран из nodes и не потерять работу при перезагрузке страницы. Итерация закрывается документацией и ADR.

## Зафиксированные решения

- Операции store:

```ts
addNode(type: "container" | "image" | "text"): void; // создаёт node ребёнком выбранного container, иначе — ребёнком root
deleteNode(nodeId: string): void;                     // удаляет node и всех потомков рекурсивно
```

- ID новых nodes — `createStableId()` из `@pixi-ui-editor/schema`.
- Значения нового node: `name` = `"Container N" / "Image N" / "Text N"` (N — счётчик по документу), `visible: true`, transform `{ x: 50, y: 50, width: 100, height: 100, scaleX: 1, scaleY: 1, rotation: 0 }`; для `image` — `assetId` существующего asset из sample (первый asset документа); для `text` — `text: "New text"`. Если родитель не container (image/text выбран) — новый node добавляется к родителю выбранного либо к root: не вкладывайте nodes в листовые типы.
- `deleteNode` запрещено удалять последний root node (кнопка disabled) — пустая сцена вне scope.
- Как и раньше: операция применяется к клону, прогоняется `validateProjectDocument`, невалидный результат отбрасывается с `console.warn`.
- Persistence: сериализованный документ (`serializeProjectDocument`) сохраняется в `localStorage` (ключ `pixi-ui-editor:document`) при каждом изменении store; при старте документ читается оттуда через `parseProjectDocumentJson`, при ошибке/отсутствии — загружается sample. Кнопка `Reset to sample` в toolbar очищает ключ и перезагружает sample.

## Что создать

1. Кнопки в toolbar (или над деревом): `+ Container`, `+ Image`, `+ Text`, `Delete` (disabled без выделения и для последнего root).
2. Операции `addNode`/`deleteNode` в store; после `deleteNode` выделение сбрасывается.
3. Autosave/восстановление/reset, как зафиксировано выше.
4. Unit-тесты store (vitest, без DOM): `addNode` добавляет валидный node к выбранному container; `deleteNode` удаляет поддерево целиком (children родителя и массив `nodes` согласованы); последний root не удаляется.
5. ADR `docs/adr/0002-editor-prototype-stack.md` (статус `Accepted`) — только уже реализованные решения: стек editor-web (Vite/React/zustand/pixi.js), document-in-store как единственный source of truth, full rebuild сцены при изменении, рендеринг через shared `runtime-pixi`, placeholder-рендеринг без ассетов, localStorage как prototype persistence (не source of truth продукта). Не описывайте в ADR undo/redo, backend и asset pipeline.
6. Документация: команда запуска редактора в корневом README (короткая секция); ссылка на итерацию 02 в `docs/README.md`; обновление секции «Текущее состояние проекта» в `agents.md` (итерация 02 завершена, что реально работает, следующий фронт).

Не реализуйте undo/redo, копирование, переименование через дерево, drag-and-drop в дереве и выбор asset для image.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

1. Выберите root container, нажмите `+ Image` → на canvas появился серый прямоугольник в (50, 50), в дереве — `Image N` внутри root.
2. Добавьте `+ Text`, перетащите оба node, поменяйте текст в inspector.
3. Перезагрузите страницу → собранный экран восстановился, включая выделение сброшено, документ тот же.
4. Удалите node с детьми → исчезло всё поддерево и из дерева, и с canvas.
5. `Reset to sample` → вернулся исходный sample project.
6. В console нет ошибок.

## Критерии приёмки

- Новые nodes валидны (проходят validation), ссылки строятся по `id`, не по имени.
- Удаление не оставляет «висячих» id ни в `children`, ни в `nodes` (подтверждено тестом).
- Persistence использует `serializeProjectDocument`/`parseProjectDocumentJson`, а не собственный `JSON.stringify` документа.
- ADR 0002 описывает только реализованное; документация обновлена во всех трёх местах.
- Шесть шагов визуальной проверки воспроизводятся; обязательные команды зелёные.

## Отчёт исполнителя

Перечислите операции store и их тесты, путь к ADR, обновлённые документы, результаты визуальной проверки по шагам и результаты команд.
