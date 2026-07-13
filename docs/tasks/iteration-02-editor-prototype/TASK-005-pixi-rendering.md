# TASK-005 — PixiJS rendering сцены в runtime-pixi и canvas в редакторе

## Зависимость

TASK-004 завершена. Сначала выполните её проверки, включая визуальную.

## Цель

Sample project отображается как PixiJS-сцена в центральной зоне редактора. Rendering-код живёт в `@pixi-ui-editor/runtime-pixi`, потому что editor preview обязан использовать production runtime.

## Зафиксированные решения

- pixi.js ^8. Зависимость добавляется в `runtime-pixi` и в `editor-web` (для `Application`).
- Рендерится только профиль `desktop`.
- Полный rebuild: функция построения сцены каждый раз создаёт новое дерево display objects; никакого diff/patch.
- Правила отображения v0:
  - `container` → `PIXI.Container`; `width`/`height` игнорируются;
  - `image` → `PIXI.Graphics`: прямоугольник `width × height`, заливка `#4a5568`, рамка 1px `#94a3b8` (реальный asset не загружается);
  - `text` → `PIXI.Text`, стиль: `fontFamily: "Arial", fontSize: 24, fill: 0xffffff`; `width`/`height` игнорируются;
  - `spine` и `prefab-instance` → magenta (`#ff00ff`) прямоугольник 100×100 (children при этом рендерятся как обычно);
  - node с `visible: false` не отображается (`visible = false` у display object, не пропуск создания).

## Что создать

### Часть A — runtime-pixi

Публичные функции в `@pixi-ui-editor/runtime-pixi`:

```ts
/** Базовый transform node, слитый по-полям с layoutOverrides[profile] (включая visible). */
function resolveProfileTransform(node: UINode, profile: LayoutProfileId): { transform: Transform; visible: boolean };

/** Строит дерево display objects сцены. Возвращает root Container и Map nodeId → display object. */
function buildSceneView(document: ProjectDocument, sceneId: string, profile: LayoutProfileId): { root: Container; nodeViews: Map<string, Container> };
```

Требования:

- transform применяется так: `position(x, y)`, `scale(scaleX, scaleY)`, `rotation` (радианы);
- порядок children сохраняется как в массиве `children`;
- неизвестный `sceneId` — понятная ошибка;
- функции не читают DOM, не создают `Application` и не содержат editor-семантики.

Один unit-тест на `resolveProfileTransform`: без override, с частичным `desktop` override, с `visible: false` в override. Тесты на `buildSceneView` не пишите (headless canvas не входит в scope) — его проверяет визуальная проверка.

### Часть B — editor-web

Компонент `SceneCanvas` в центральной зоне:

- создаёт `PIXI.Application` (`background: 0x1e1e2e`, `resizeTo` контейнерный div) в `useEffect`, уничтожает при unmount;
- вызывает `buildSceneView` и добавляет root на stage;
- при изменении документа (в этой задаче он ещё статичен) — destroy старого root, build нового.

React StrictMode двойной mount в dev — известная ловушка: инициализация `Application.init()` асинхронна, обеспечьте корректный cleanup (флаг отмены или отключите StrictMode с комментарием).

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

`pnpm --filter @pixi-ui-editor/editor-web dev`: в центре виден тёмный canvas, на нём серый прямоугольник (image placeholder) и белый текст из sample project в позициях из JSON. Измените в `examples/sample-project/project.json` координату `x` у text-node, сохраните — после перезагрузки страницы текст сместился. Верните значение обратно (git diff должен остаться пустым).

## Критерии приёмки

- Весь mapping node → display object находится в `runtime-pixi`; `editor-web` не создаёт display objects по типам nodes сам.
- `resolveProfileTransform` покрыт указанным unit-тестом.
- Canvas корректно переживает hot reload и StrictMode (нет двух наложенных сцен, нет ошибок в console).
- Обязательные команды зелёные.

## Отчёт исполнителя

Перечислите публичные функции runtime-pixi, опишите увиденное на canvas, результат эксперимента с правкой JSON и результаты команд.
