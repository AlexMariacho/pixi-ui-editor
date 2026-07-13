# TASK-012 — секция Orientation в inspector

## Зависимость

TASK-011 завершена. Сначала выполните её проверки, включая визуальную.

## Цель

В inspector над секцией Transform появляется секция **Orientation** с двумя строками — Horizontal и Vertical — и чекбоксом напротив каждой. Галочка означает «элемент отображается в этой ориентации» (как в zStudio). Снятие галочки немедленно прячет node на canvas в соответствующей ориентации.

## Зафиксированные решения

- Хранение — существующее поле схемы `layoutOverrides.{desktop|mobile}.visible`; схема не меняется.
- Семантика чекбокса `Horizontal` (профиль `desktop`; для `Vertical`/`mobile` симметрично):
  - состояние: снят, если `layoutOverrides.desktop.visible === false`, иначе установлен;
  - снятие галочки → записать `layoutOverrides.desktop.visible = false`;
  - установка галочки → **удалить** ключ `visible` из override (не писать `true`), а если override-объект стал пустым (`{}`) — удалить и его; пустой `layoutOverrides` тоже удаляется. Документ не должен накапливать мусорные пустые объекты.
- Базовый `node.visible` (чекбокс Visible в секции Node) не трогается: он остаётся общим выключателем для обеих ориентаций. Runtime уже комбинирует их: `override.visible ?? node.visible`.
- Обе галочки могут быть сняты одновременно — это допустимо (элемент нигде не виден, но остаётся в дереве).
- В store добавляется одна операция (через `commitCandidate`):

```ts
setNodeOrientationVisibility(nodeId: string, profile: LayoutProfileId, visible: boolean): void;
```

## Что создать

- Операцию `setNodeOrientationVisibility` в `store.ts`.
- Секцию `InspectorWindow title="Orientation"` в `Inspector.tsx`, размещённую **между** секциями Node и Transform, из двух `InspectorField` (Horizontal, Vertical) с чекбоксами. Используйте существующие компоненты секций/полей.

В тесты store добавьте один unit-тест: `setNodeOrientationVisibility(id, "mobile", false)` записывает `layoutOverrides.mobile.visible === false`; повторный вызов с `true` удаляет ключ `visible` и пустые объекты (у node без transform-override `layoutOverrides` исчезает целиком); документ валиден после обеих операций.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

1. Выберите Logo → в секции Orientation обе галочки установлены.
2. Снимите Vertical → в горизонтальной ориентации Logo виден; переключитесь в Vertical → Logo исчез с canvas, но остался в дереве и выделяем из дерева.
3. Верните галочку Vertical → Logo снова виден в вертикальной ориентации.
4. Снимите базовый Visible в секции Node → Logo исчез в обеих ориентациях, при этом обе галочки Orientation остались установленными.
5. Перезагрузите страницу после шага 2 (не возвращая галочку) → состояние восстановилось из localStorage.

## Критерии приёмки

- Секция Orientation стоит до Transform; правки идут только через `setNodeOrientationVisibility`.
- Установленная галочка не оставляет в документе `visible: true` и пустых override-объектов (проверено тестом).
- Пять шагов визуальной проверки воспроизводятся.
- Обязательные команды зелёные.

## Отчёт исполнителя

Опишите семантику операции, фрагмент `layoutOverrides` из localStorage после снятия галочки, результаты визуальной проверки по шагам и результаты команд.
