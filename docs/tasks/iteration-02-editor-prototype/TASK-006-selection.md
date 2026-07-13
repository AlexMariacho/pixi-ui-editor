# TASK-006 — selection в дереве и на canvas с рамкой выделения

## Зависимость

TASK-005 завершена. Сначала выполните её проверки, включая визуальную.

## Цель

Один и тот же node можно выбрать кликом в hierarchy-дереве или кликом на canvas; выбранный node подсвечивается и там, и там.

## Зафиксированные решения

- В `editor-web` появляется zustand ^5 store (`src/store.ts`) — единый source of truth редактора:

```ts
type EditorState = {
  document: ProjectDocument;
  sceneId: string;
  selectedNodeId: string | null;
  selectNode(id: string | null): void;
};
```

Документ и дерево переводятся с локального React state на этот store (sample загружается при создании store).

- Только одиночное выделение.
- Рамка выделения — editor overlay в `editor-web`: отдельный `PIXI.Container` поверх сцены, в нём `PIXI.Graphics`-прямоугольник по `getBounds()` выбранного display object (жёлтая рамка `0xfacc15`, 2px, без заливки). Overlay-код **не** добавляется в `runtime-pixi`.
- Hit-testing на canvas — средствами PixiJS: у display objects из `buildSceneView` включается `eventMode: "static"` в editor-web (пройдитесь по `nodeViews` и навесьте `pointerdown`), клик по пустому месту снимает выделение.

## Что создать

1. `src/store.ts` c состоянием выше; никакой мутации `document` в этой задаче нет.
2. Дерево: клик по строке вызывает `selectNode(id)`; выбранная строка подсвечена фоном.
3. `SceneCanvas`: подписка на `selectedNodeId`, отрисовка/обновление рамки; `pointerdown` по node выбирает его (при вложенных nodes выбирается самый верхний под курсором — используйте `event.stopPropagation()`), по фону stage — сбрасывает выделение.
4. Рамка обновляется и после rebuild сцены (пересоздание сцены не должно терять выделение, если node всё ещё существует).

Не реализуйте multi-select, hover-подсветку, rectangle select и контекстные меню.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

1. Клик по text-node в дереве → жёлтая рамка вокруг текста на canvas, строка подсвечена.
2. Клик по серому прямоугольнику на canvas → в дереве подсветилась строка image-node, рамка вокруг прямоугольника.
3. Клик по пустому фону canvas → выделение снято и в дереве, и на canvas.
4. В console нет ошибок.

## Критерии приёмки

- Выделение хранится только в store; дерево и canvas — его отображения.
- `runtime-pixi` не изменился, кроме случаев, когда для hit-testing понадобилось вернуть дополнительные данные из `buildSceneView` (тогда — минимально).
- Все четыре шага визуальной проверки воспроизводятся.
- Обязательные команды зелёные.

## Отчёт исполнителя

Опишите структуру store, как связаны дерево/canvas/overlay, результаты визуальной проверки по шагам и результаты команд.
