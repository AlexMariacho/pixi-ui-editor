# Pixi UI Editor

Pixi UI Editor — web-first редактор для сборки presentation-слоя игрового UI на PixiJS. Он позволяет дизайнеру собрать структуру интерфейса, настроить её для разных экранов, добавить графические и Spine-ассеты, переиспользовать фрагменты через пресеты и выгрузить пакет, который воспроизводится общим PixiJS runtime.

Редактор не является игровым движком и не хранит gameplay-логику. Документ описывает только UI: иерархию, ассеты, layout-профили, трансформы, якоря и ссылки на пресеты. Поведение игры подключается отдельно через bindings и игровой код.

## Основная концепция

- **Один декларативный документ.** В документ не сериализуются объекты PixiJS; его можно валидировать, мигрировать и детерминированно сериализовать.
- **Stable ID вместо имён и путей.** Node, asset, scene и preset имеют неизменяемые идентификаторы; замена файла ассета не ломает ссылки.
- **Одна hierarchy и layout-профили.** Desktop и mobile — не копии сцен. Для каждой ноды можно независимо задать overrides transform и visibility для horizontal и vertical профилей.
- **Якоря относительно родителя.** Поддерживаются точечные и stretch-якоря; stretch-хранит размеры как отступы от якорного прямоугольника. Это позволяет UI адаптироваться к размеру родительского контейнера.
- **Один runtime для редактора и игры.** Canvas редактора, отдельный Preview и приложение-потребитель используют `packages/runtime-pixi`, поэтому layout resolver и правила рендеринга не дублируются.
- **Публикуемый пакет неизменяем.** Export формирует самодостаточный ZIP с `project.json` и файлами ассетов; сохранённый в браузере draft сам по себе не является контрактом игры.

Подробное продуктовое описание находится в [концепции платформы](docs/game-ui-authoring-platform-concept.md), а границы MVP и порядок дальнейшей работы — в [плане реализации](docs/game-ui-platform-implementation-plan-mvp-v3.md).

## Что уже работает

В `apps/editor-web` доступен работающий браузерный прототип:

- редактирование нескольких окон проекта и обзор всех окон в режиме **Map**;
- общая hierarchy: selection, multi-selection, drag-and-drop, создание, переименование, удаление и изменение порядка нод;
- canvas-инструменты Select, Pan и Resize, гизмосы выделения и якорей;
- Inspector для transform, visibility, pivot, якорей, текстовых, image- и Spine-нод;
- отдельные horizontal/vertical layout-профили с независимыми transforms и reference viewport; готовые desktop/tablet/mobile presets и ручной ввод разрешения;
- image-ассеты: загрузка, замена файла с сохранением ID, назначение нодам, просмотр и безопасное удаление только неиспользуемых ассетов;
- Spine-ассеты: загрузка, просмотр анимаций, loop, scrubbing по времени и кадрам;
- плавающие и сохраняющие свои настройки окна **Assets** и **Presets**; Assets имеет compact/list/grid представления;
- presets: создание из фрагмента сцены, prefab-instance ноды, вход в режим редактирования пресета и read-only отображение его спроецированного содержимого в hierarchy;
- Preview выбранного окна в отдельном popup без editor overlays, с масштабированием fixed layout при ручном изменении размера окна;
- Export ZIP-пакета: `project.json` и все используемые файлы в `assets/<assetId>/<fileName>`;
- сохранение документа и UI-preferences в browser `localStorage`, а также **Reset to sample** для возврата к эталонному проекту;
- единый command registry для действий toolbar и клавиатуры, включая Select/Pan/Resize/Map и Delete.

Текущая история итераций и принятые решения перечислены в [документации](docs/README.md) и [ADR](docs/adr/).

## Структура репозитория

Это один pnpm workspace ([pnpm-workspace.yaml](pnpm-workspace.yaml)).

- `apps/editor-web/` — работающий React/Vite редактор;
- `packages/schema/` — контракт документа: типы, runtime schema, validation, migrations и deterministic serialization;
- `packages/runtime-pixi/` — загрузка документа, profile resolver и общий PixiJS renderer;
- `examples/sample-project/` — version-controlled эталонный документ для smoke-тестов;
- `examples/pixi-app/` — минимальное PixiJS-приложение, воспроизводящее экспортированный package;
- `apps/api/`, `apps/runtime-demo/`, `packages/editor-core/`, `packages/exporter/`, `packages/validators/`, `packages/shared/` — заготовки для следующих этапов.

## Требования

- Node.js **20.19+ или 22.12+**; рекомендуется Node.js 22 LTS;
- pnpm 10.

`apps/editor-web` использует Vite 7. Node.js 20.11.0 может собрать workspace и запустить тесты, но не запускает dev-server: Vite завершится с `TypeError: crypto.hash is not a function`.

```powershell
node --version
pnpm --version
```

Если `pnpm` отсутствует в `PATH`:

```powershell
npm install -g pnpm@10.27.0
```

## Первый запуск и проверки

Из корня репозитория:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

`pnpm build` нужно выполнить до `pnpm typecheck`: типы межпакетных импортов резолвятся из `dist/`. Проект намеренно использует небольшой набор контрактных и pipeline-тестов вместо coverage quota; правила описаны в [стратегии тестирования](docs/testing-strategy.md).

## Запуск редактора

```powershell
pnpm --filter @pixi-ui-editor/editor-web dev
```

Откройте URL из вывода Vite (обычно `http://localhost:5173/`). Если порт занят, Vite выберет другой. При первом открытии загружается sample project; последующие изменения автоматически восстанавливаются из `localStorage`.

Для проверки production bundle:

```powershell
pnpm build
pnpm --filter @pixi-ui-editor/editor-web preview
```

`preview` раздаёт уже собранный `apps/editor-web/dist`; после новой сборки его нужно перезапустить.

## Smoke-тест документа

Эталонный [sample project](examples/sample-project/project.json) загружается через headless runtime boundary:

```powershell
pnpm --filter @pixi-ui-editor/runtime-pixi test
```
