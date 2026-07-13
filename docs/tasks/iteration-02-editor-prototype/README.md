# Итерация 02 — визуальный прототип редактора

## Зачем нужна эта итерация

Итерация 01 создала формат документа и headless loader, но результат нельзя увидеть глазами. Эта итерация выводит sample project на экран и строит вокруг него минимальный цикл редактирования: посмотреть сцену → выбрать node → изменить свойства → передвинуть мышью → добавить/удалить node → перезагрузить страницу и продолжить.

Это ограниченный срез Этапов 1–2 [плана MVP](../../game-ui-platform-implementation-plan-mvp-v3.md) (частично RT-02, RT-04, ED-01, ED-03, ED-05, ED-06). Полный runtime vertical slice (ассеты, Spine, bindings-demo) и полный editor (undo/redo, reparent, resize handles) сюда сознательно не входят.

## Главное правило итерации

**Каждая задача заканчивается результатом, который можно открыть в браузере и проверить глазами.** Раздел «Визуальная проверка» в каждой задаче обязателен к выполнению и к описанию в отчёте исполнителя.

## Зафиксированные решения итерации

Эти решения приняты владельцем проекта. Исполнители задач не выбирают альтернативы и не «улучшают» их:

- editor-web: **Vite ^7 + React ^19 + TypeScript**; rendering — **pixi.js ^8**; state — **zustand ^5**;
- единственный source of truth в редакторе — объект `ProjectDocument` в zustand store; PixiJS никогда не является источником данных;
- при **любом** изменении документа PixiJS-сцена **полностью пересоздаётся** (destroy + rebuild). Никаких incremental updates: на объёмах прототипа это дёшево и исключает рассинхронизацию;
- рендерится только профиль `desktop`: transform node = базовый `transform`, поверх которого по-полям наложен `layoutOverrides.desktop` (если есть);
- реальные ассеты не загружаются: `image` рисуется как placeholder-прямоугольник;
- команды запускаются из PowerShell; сборка воркспейса (`pnpm build`) обязана оставаться зелёной после каждой задачи.

Архитектурно значимые решения фиксируются в ADR 0002 в последней задаче итерации.

## Демонстрируемый результат

`pnpm --filter @pixi-ui-editor/editor-web dev` открывает в браузере редактор, в котором:

1. виден sample project: hierarchy-дерево слева, PixiJS-сцена в центре, inspector справа;
2. клик по node в дереве или на canvas выделяет его рамкой;
3. правка полей в inspector немедленно меняет картинку;
4. выбранный node можно перетащить мышью;
5. кнопки добавляют и удаляют nodes;
6. после перезагрузки страницы отредактированный документ восстанавливается из localStorage.

## Задачи и порядок выполнения

Задачи выполняются строго последовательно. Исполнитель следующей задачи сначала запускает проверки предыдущей (включая визуальную).

1. [TASK-004 — editor shell на Vite + React с деревом sample project](TASK-004-editor-shell.md)
2. [TASK-005 — PixiJS rendering сцены в runtime-pixi и canvas в редакторе](TASK-005-pixi-rendering.md)
3. [TASK-006 — selection в дереве и на canvas с рамкой выделения](TASK-006-selection.md)
4. [TASK-007 — inspector свойств с live-обновлением сцены](TASK-007-inspector.md)
5. [TASK-008 — перетаскивание node мышью на canvas](TASK-008-drag-move.md)
6. [TASK-009 — добавление/удаление nodes, autosave в localStorage, ADR 0002](TASK-009-nodes-and-persistence.md)

## Общий Definition of Done

- `pnpm build`, `pnpm typecheck`, `pnpm test` завершаются с кодом `0` из чистого checkout (в этом порядке);
- dev-server редактора поднимается одной документированной командой;
- все шесть пунктов демонстрируемого результата воспроизводятся вручную;
- документ в store всегда проходит `validateProjectDocument` после операций редактирования (проверяется тестами store);
- в `packages/runtime-pixi` нет editor-specific кода (selection, drag, store); в `apps/editor-web` нет собственной логики validation/migration/serialization;
- ADR 0002 записан, ссылка на итерацию добавлена в `docs/README.md`, секция «Текущее состояние» в `agents.md` обновлена.

## Не входит в итерацию

- undo/redo и command history;
- resize/rotate handles, multi-selection, reorder и reparent;
- редактирование и preview профиля `mobile`;
- загрузка реальных изображений, Spine, prefab resolution;
- bindings-demo, runtime-demo app, backend, publish/export;
- редактирование `referenceViewports`, настроек проекта и ассетов.

Если для выполнения задачи приходится реализовывать что-либо из этого списка, остановитесь: scope выбран неверно.
