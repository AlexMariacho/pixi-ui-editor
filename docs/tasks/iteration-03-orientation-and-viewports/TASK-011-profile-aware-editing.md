# TASK-011 — редактирование transform в активной ориентации

## Зависимость

TASK-010 завершена. Сначала выполните её проверки, включая визуальную.

## Цель

Правки позиции/размера/поворота применяются к активной ориентации: в Horizontal — к базовому `transform`, в Vertical — к `layoutOverrides.mobile.transform`. Перетаскивание node в вертикальной ориентации больше не ломает горизонтальную раскладку.

## Зафиксированные решения

- В store добавляется одна операция (все правки transform — только через неё):

```ts
updateNodeProfileTransform(nodeId: string, patch: Partial<UINode["transform"]>): void;
```

Поведение: при `activeProfile === "desktop"` patch по-полям мержится в базовый `node.transform`; при `"mobile"` — в `node.layoutOverrides.mobile.transform` (объекты `layoutOverrides`/`mobile`/`transform` создаются при необходимости). Затем `validateProjectDocument` через существующий `commitCandidate`; невалидный кандидат отбрасывается.

- Из `updateNode` возможность патчить `transform` удаляется (сигнатура сужается до `name`/`visible`/`text`), чтобы остался один путь записи transform.
- Inspector в секции Transform показывает **resolved-значения** активной ориентации — используйте `resolveProfileTransform(node, activeProfile)` из `@pixi-ui-editor/runtime-pixi`, не дублируйте merge-логику в editor-web. Все поля секции (X/Y/W/H/Scale/Rotation/Pivot) пишут через `updateNodeProfileTransform`.
- Drag на canvas пишет через ту же операцию: patch `{ x, y }` (без копирования остальных полей transform).
- В vertical-ориентации в override пишутся **только реально отредактированные поля** — не сохраняйте туда полный transform: частичный override — это контракт схемы.
- `layoutOverrides.desktop` не создаётся и не редактируется; сброс override и индикация переопределённых полей — вне scope.

## Что создать

- Операцию `updateNodeProfileTransform` в `store.ts`, сужение `updateNode`.
- Переход `Inspector.tsx` (секция Transform, включая Pivot/Rotation) на resolved-значения и новую операцию.
- Переход drag-логики в `App.tsx` на новую операцию с patch `{ x, y }`.

В тесты store добавьте один unit-тест: при `activeProfile: "mobile"` `updateNodeProfileTransform(id, { x: 10 })` создаёт `layoutOverrides.mobile.transform.x === 10`, не меняет базовый `transform` и не добавляет других ключей в override; при `activeProfile: "desktop"` тот же вызов меняет базовый `transform.x`. Невалидный patch (например `width: 0` в horizontal) отбрасывается.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

1. В Horizontal сдвиньте Greeting мышью → переключитесь в Vertical → Greeting сдвинулся и там (у него нет mobile-override, вертикальная раскладка наследует базовый transform — это корректно).
2. В Vertical сдвиньте Logo мышью → переключитесь в Horizontal → Logo в горизонтальной ориентации **не сдвинулся**.
3. В Vertical выберите Logo → поля X/Y в inspector показывают вертикальные (override) значения; правка Width стрелками меняет ширину только вертикальной раскладки.
4. В Horizontal правка X у Logo меняет только горизонтальную раскладку (вертикальная закреплена override-ом).
5. Перезагрузите страницу → обе раскладки восстановились из localStorage.

## Критерии приёмки

- Все правки transform идут через `updateNodeProfileTransform`; прямых записей `transform`/`layoutOverrides` из компонентов нет.
- Override в документе частичный: содержит только отредактированные поля (проверено тестом).
- Пять шагов визуальной проверки воспроизводятся.
- Обязательные команды зелёные.

## Отчёт исполнителя

Опишите сигнатуру и merge-поведение операции, что изменилось в Inspector и drag, содержимое `layoutOverrides.mobile` после шага 2 (вставьте фрагмент JSON из localStorage), результаты визуальной проверки и команд.
