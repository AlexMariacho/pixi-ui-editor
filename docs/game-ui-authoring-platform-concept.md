# Концепция веб-сервиса для создания игрового UI на PixiJS

## 1. Назначение документа

Этот документ описывает концепцию веб-сервиса для визуальной сборки пользовательских интерфейсов игр.

Документ фиксирует:

- какую проблему должен решать продукт;
- кто и как будет им пользоваться;
- что является частью редактора, а что остается в игровом коде;
- базовые архитектурные принципы;
- модель сцен, узлов, ассетов и префабов;
- подход к адаптивной верстке;
- формат экспорта;
- требования к runtime-библиотеке для PixiJS;
- границы первой версии и возможные направления развития.

Документ не является техническим планом реализации. На его основе в дальнейшем должны быть подготовлены:

- техническая архитектура;
- этапы разработки;
- backlog;
- задачи для frontend, backend и runtime-команд;
- формат JSON-схем;
- план MVP;
- критерии готовности продукта.

---

# 2. Исходная проблема

Сейчас интерфейсы игр разрабатываются в несколько разрозненных этапов.

Типичный процесс выглядит так:

1. Дизайнер рисует статический интерфейс в Figma.
2. Аниматор отдельно подготавливает Spine-анимации.
3. Ассеты экспортируются в PNG, WebP, Spine JSON или binary format.
4. Frontend-разработчик вручную собирает интерфейс в Thing Editor.
5. Разработчик вручную воспроизводит расположение элементов, иерархию, размеры и адаптивное поведение.
6. При изменениях дизайна часть работы приходится повторять.
7. Дизайнер не всегда может проверить итоговое поведение интерфейса непосредственно в игровом runtime.

У этого процесса есть несколько проблем:

- одна и та же визуальная работа частично выполняется дважды;
- статический макет не описывает реальное поведение интерфейса;
- адаптивность остается ответственностью разработчика;
- Spine-анимации существуют отдельно от основного UI-макета;
- изменения ассетов могут требовать ручной пересборки;
- дизайнер не видит финальный результат до интеграции;
- frontend-разработчик тратит время на визуальную сборку вместо игровой логики;
- между дизайном и реализацией легко возникают расхождения;
- текущий pipeline плохо масштабируется на большое количество экранов и игр.

---

# 3. Идея продукта

Необходимо создать веб-сервис для визуальной сборки игрового UI.

По модели использования сервис должен напоминать Figma или другой облачный визуальный редактор:

- дизайнер открывает проект в браузере;
- загружает подготовленные ассеты;
- собирает экраны игры;
- создает и использует префабы;
- настраивает адаптивное поведение;
- просматривает Spine-анимации;
- проверяет интерфейс на разных разрешениях;
- публикует готовую версию проекта.

После этого frontend-разработчик:

- открывает тот же проект;
- выбирает опубликованную версию;
- выгружает UI package;
- добавляет package в проект игры;
- подключает runtime bindings;
- реализует gameplay и бизнес-логику.

Целевой pipeline:

```text
Graphic assets + Spine assets
              ↓
       Web UI Editor
              ↓
     Published UI Package
              ↓
       PixiJS UI Runtime
              ↓
         Game Logic
```

Сервис должен стать source of truth для визуальной структуры игрового интерфейса.

---

# 4. Основная цель

Главная цель продукта — перенести сборку игрового UI из ручного frontend-процесса в визуальную среду, доступную дизайнеру.

После внедрения сервиса дизайнер должен отвечать за:

- визуальную иерархию;
- расположение элементов;
- размеры;
- адаптивное поведение;
- выбор и замену ассетов;
- размещение Spine-анимаций;
- визуальные состояния;
- повторно используемые префабы;
- подготовку всех экранов;
- визуальную проверку результата.

Frontend-разработчик должен отвечать за:

- загрузку UI package;
- подключение runtime-объектов;
- обработку действий пользователя;
- gameplay;
- бизнес-логику;
- сетевое взаимодействие;
- состояние игры;
- работу динамических игровых систем.

---

# 5. Позиционирование продукта

Продукт не является:

- редактором исходной графики;
- заменой Photoshop, Illustrator или Spine;
- игровым движком;
- редактором gameplay;
- системой визуального программирования;
- конструктором slot-игр;
- редактором исключительно для одного жанра.

Продукт является:

> Универсальным веб-сервисом для сборки, адаптации, организации, предпросмотра и экспорта игрового UI.

PixiJS является первым и основным runtime target, но концептуальная модель проекта не должна быть жестко связана с внутренним API PixiJS.

---

# 6. Универсальность и независимость от жанра

Редактор не должен содержать встроенные сущности, специфичные для слотов или другого жанра.

В ядре редактора не должно быть понятий:

- Reel;
- Symbol;
- SpinButton;
- Payline;
- BalancePanel;
- Inventory;
- HealthBar;
- QuestPanel;
- CardHand;
- DialogueSystem.

Редактор должен работать с универсальными визуальными сущностями:

```text
Node
├── Container
├── Image
├── Text
├── Spine
├── Shape
├── Mask
├── Slot
├── Prefab Instance
└── Custom Extension Node
```

Специализация под конкретные типы игр должна появляться через:

- пользовательские префабы;
- библиотеки компонентов;
- шаблоны проектов;
- naming conventions;
- custom metadata;
- runtime bindings;
- дополнительные плагины в будущем.

Примеры шаблонов:

```text
Slot Game Template
├── Main Screen
├── Bonus Screen
├── Paytable
├── Primary Button Prefab
├── Bet Controls Prefab
└── Modal Prefab
```

```text
RPG Template
├── HUD
├── Inventory
├── Dialogue Screen
├── Item Slot Prefab
├── Character Panel Prefab
└── Progress Bar Prefab
```

Шаблоны используют одно и то же ядро редактора.

---

# 7. Главный архитектурный принцип

Редактор экспортирует presentation structure.

Игровой runtime добавляет поведение и gameplay.

```text
UI Document
     ↓
UI Runtime Loader
     ↓
Visual Hierarchy
     ↓
Runtime Bindings
     ↓
Game Controllers
```

Редактор является source of truth для:

- сцен и экранов;
- визуальной иерархии;
- трансформаций;
- layout rules;
- ассетов;
- текста;
- Spine-объектов;
- масок;
- визуальных состояний;
- префабов;
- именованных точек подключения;
- presentation metadata.

Редактор не является source of truth для:

- game state;
- RNG;
- reels logic;
- paylines;
- symbol generation;
- inventory state;
- battle logic;
- network state;
- feature state machines;
- backend data;
- игровой экономики;
- динамически создаваемых игровых сущностей.

---

# 8. Пользовательские роли

## 8.1. Дизайнер

Дизайнер должен иметь возможность:

- создать проект;
- создать несколько сцен или экранов;
- загрузить изображения, шрифты и Spine-ассеты;
- разместить объекты на canvas;
- изменять свойства объектов;
- создавать и редактировать префабы;
- создавать экземпляры префабов;
- менять ассеты без нарушения ссылок;
- задавать responsive layout;
- переключать размеры viewport;
- просматривать анимации;
- проверять safe area;
- публиковать готовую версию.

## 8.2. Frontend-разработчик

Frontend-разработчик должен иметь возможность:

- открыть проект;
- просмотреть структуру;
- проверить bindings;
- увидеть ошибки валидации;
- скачать опубликованный package;
- сравнить версии;
- подключить package к PixiJS runtime;
- получить типизированный контракт;
- подключить игровое поведение к UI.

## 8.3. Technical artist или lead designer

Возможные задачи:

- создание общих префабов;
- создание библиотек компонентов;
- настройка шаблонов;
- подготовка design tokens;
- организация ассетов;
- проверка адаптивности;
- управление conventions;
- подготовка reusable project structures.

## 8.4. Администратор проекта

В будущих версиях:

- управление доступами;
- управление командами;
- публикация библиотек;
- управление версиями;
- настройка export targets;
- управление workspace.

---

# 9. Структура веб-сервиса

Высокоуровневая структура:

```text
Web Application
├── Project Browser
├── Scene Editor
├── Scene Tree
├── Property Inspector
├── Asset Library
├── Prefab Library
├── Responsive Preview
├── Animation Preview
├── Validation Panel
├── Version History
└── Export Panel
```

Backend:

```text
Backend
├── Users
├── Teams
├── Projects
├── Documents
├── Assets
├── Prefabs
├── Revisions
├── Published Versions
└── Export Artifacts
```

Runtime package:

```text
PixiJS Runtime
├── Package Loader
├── Asset Resolver
├── Node Factory
├── Layout Engine
├── Prefab Resolver
├── Binding Registry
├── Spine Adapter
└── Validation Layer
```

---

# 10. Проект

Проект — верхнеуровневая сущность сервиса.

Проект может содержать:

```text
Game UI Project
├── Assets
├── Scenes
├── Prefabs
├── Tokens
├── Viewport Presets
├── Templates
├── Bindings
├── Settings
├── Revisions
└── Published Versions
```

Пример метаданных:

```json
{
  "id": "project_game_42",
  "name": "Example Game UI",
  "schemaVersion": 1,
  "editorVersion": "0.1.0",
  "createdAt": "2026-07-10T10:00:00Z",
  "updatedAt": "2026-07-10T11:00:00Z"
}
```

---

# 11. Сцены и экраны

Сцена представляет отдельный экран или визуальный контекст.

Примеры:

- Main Game;
- Loading;
- Paytable;
- Settings;
- Bonus Game;
- Store;
- Inventory;
- Map;
- Result Screen;
- Popup Layer.

Сцена должна содержать:

- root node;
- reference resolution;
- responsive rules;
- viewport presets;
- background settings;
- local bindings;
- local node hierarchy.

Пример:

```json
{
  "id": "scene_main",
  "name": "Main Screen",
  "rootNodeId": "node_main_root",
  "referenceViewport": {
    "width": 1920,
    "height": 1080
  }
}
```

---

# 12. Node model

Node — базовая сущность visual hierarchy.

Каждый node должен иметь стабильный технический идентификатор.

```json
{
  "id": "node_8f21",
  "name": "Main Background",
  "type": "image",
  "parentId": "node_root",
  "children": [],
  "visible": true
}
```

Ключевые свойства:

- `id` — стабильный UUID;
- `name` — имя для пользователя;
- `type` — тип узла;
- `parentId` — родитель;
- `children` — дочерние узлы;
- `transform` — позиция, масштаб, вращение;
- `layout` — правила верстки;
- `components` — дополнительные возможности;
- `binding` — опциональный runtime binding;
- `metadata` — расширяемые данные.

## 12.1. Stable ID

Ссылки нельзя строить по:

- имени объекта;
- пути в hierarchy;
- имени файла;
- индексу в массиве;
- display label.

Имя может свободно изменяться.

Stable ID не должен меняться при:

- переименовании;
- замене ассета;
- изменении layout;
- переносе в hierarchy;
- изменении prefab override;
- публикации новой версии.

---

# 13. Разделение Node и Asset

Один из основных принципов системы:

> Визуальный объект и используемый им ресурс — разные сущности.

Image node:

```json
{
  "id": "node_background",
  "name": "Main Background",
  "type": "image",
  "assetRef": "asset_background"
}
```

Asset:

```json
{
  "id": "asset_background",
  "name": "Main Background Texture",
  "type": "texture",
  "source": "assets/background-v1.webp"
}
```

Дизайнер может заменить файл:

```json
{
  "id": "asset_background",
  "name": "Main Background Texture",
  "type": "texture",
  "source": "assets/background-v2.png"
}
```

При этом не меняются:

- node ID;
- asset ID;
- node name;
- layout;
- animations;
- prefab references;
- runtime bindings;
- ссылки из других объектов.

Это соответствует модели Unity, где компонент сохраняет ссылку на ресурс независимо от конкретного файла.

---

# 14. Два типа замены ассета

Редактор должен различать две операции.

## 14.1. Select another asset

У конкретного node изменяется ссылка:

```text
node.assetRef:
asset_blue_button
        ↓
asset_red_button
```

Изменяется только выбранный node или конкретный override prefab instance.

## 14.2. Replace asset source

У asset сохраняется ID, но заменяется физический файл:

```text
asset_blue_button.source:
button-v1.webp
        ↓
button-v2.webp
```

Изменения применяются ко всем объектам, использующим этот asset.

UI должен явно разделять эти операции, чтобы пользователь не заменил ресурс глобально случайно.

---

# 15. Asset Library

Asset Library должна быть отдельной подсистемой.

Поддерживаемые типы:

- PNG;
- WebP;
- JPEG;
- SVG, если runtime policy это допускает;
- bitmap fonts;
- web fonts;
- Spine skeleton;
- Spine atlas;
- Spine textures;
- audio assets в будущем;
- shader resources в будущем.

Asset record:

```json
{
  "id": "asset_a71c92d4",
  "name": "Main Background",
  "type": "texture",
  "source": {
    "file": "main-background.webp",
    "hash": "content-hash"
  },
  "metadata": {
    "width": 1920,
    "height": 1080,
    "mimeType": "image/webp"
  }
}
```

Основные операции:

- Upload;
- Rename;
- Replace Source;
- Duplicate;
- Move to Folder;
- Tag;
- Find Usages;
- Delete Unused;
- Validate;
- Reimport;
- Download Source.

Перед удалением используемого ассета сервис должен показывать зависимости.

---

# 16. Spine assets

Spine должен быть полноценным типом ассета и node.

Spine asset должен содержать:

- skeleton file;
- atlas;
- textures;
- runtime version;
- export version;
- skins;
- animations;
- events;
- metadata;
- preview thumbnail.

Пример:

```json
{
  "id": "asset_spine_dragon",
  "name": "Dragon",
  "type": "spine",
  "source": {
    "skeleton": "dragon.skel",
    "atlas": "dragon.atlas",
    "textures": [
      "dragon.webp"
    ]
  },
  "metadata": {
    "spineVersion": "4.2",
    "skins": [
      "default",
      "gold"
    ],
    "animations": [
      "idle",
      "appear",
      "win"
    ]
  }
}
```

Spine node:

```json
{
  "id": "node_dragon",
  "name": "Dragon Animation",
  "type": "spine",
  "assetRef": "asset_spine_dragon",
  "playback": {
    "animation": "idle",
    "loop": true,
    "timeScale": 1
  }
}
```

Editor preview и production runtime должны использовать совместимую реализацию Spine runtime.

---

# 17. Prefab system

Prefab — основная универсальная сущность повторного использования.

Prefab представляет:

- визуальную hierarchy;
- layout;
- вложенные nodes;
- вложенные prefabs;
- exposed properties;
- named slots;
- variants;
- default values;
- optional bindings.

Примеры prefab:

- Button;
- Modal;
- Panel;
- Card;
- Icon Button;
- Progress Bar;
- HUD Block;
- List Item;
- Tooltip;
- Inventory Slot;
- Slot Game Control Panel.

Редактор не знает бизнес-смысла этих префабов.

---

# 18. Prefab definition

Пример:

```json
{
  "id": "prefab_primary_button",
  "name": "Primary Button",
  "rootNodeId": "node_button_root",
  "exposedProperties": [
    {
      "id": "label",
      "name": "Label",
      "type": "string",
      "target": {
        "nodeId": "node_button_text",
        "property": "text"
      }
    },
    {
      "id": "icon",
      "name": "Icon",
      "type": "asset",
      "target": {
        "nodeId": "node_button_icon",
        "property": "assetRef"
      }
    }
  ]
}
```

Prefab instance:

```json
{
  "id": "node_spin_button",
  "name": "Spin Button",
  "type": "prefab-instance",
  "prefabRef": "prefab_primary_button",
  "overrides": {
    "label": "SPIN",
    "icon": "asset_spin_icon"
  }
}
```

---

# 19. Связь prefab и instance

Prefab instance не должен быть обычной копией hierarchy.

Должна сохраняться связь:

```text
Prefab Definition
        ↓
Prefab Instance
        ↓
Local Overrides
```

Если пользователь изменяет prefab definition:

- обновляются все instances;
- local overrides сохраняются;
- конфликтующие overrides валидируются;
- удаленные properties отображаются как migration issue;
- пользователь может reset override.

Необходимые операции:

- Create Prefab;
- Create Instance;
- Edit Prefab;
- Apply Override;
- Reset Override;
- Find Instances;
- Detach Instance;
- Duplicate Prefab;
- Nest Prefab;
- Expose Property.

---

# 20. Exposed properties

Prefab author должен иметь возможность открыть для instance только нужные свойства.

Типы exposed properties:

- string;
- number;
- boolean;
- color;
- asset reference;
- enum;
- text style;
- animation;
- skin;
- visibility;
- layout value;
- nested prefab;
- custom metadata.

Пример:

```text
Primary Button
├── Label
├── Icon
├── Background Asset
├── Size Variant
├── Disabled Appearance
└── Animation
```

---

# 21. Prefab slots

Prefab может содержать named slots для вложенного контента.

Пример:

```text
Modal Prefab
├── Header Slot
├── Content Slot
└── Footer Slot
```

Это позволяет создавать универсальные композиции.

Slot node:

```json
{
  "id": "node_modal_content_slot",
  "name": "Content",
  "type": "slot",
  "slot": "content"
}
```

Instance может передавать hierarchy в slot без изменения prefab definition.

---

# 22. Variants

Variant — набор overrides для prefab.

Пример:

```text
Primary Button
├── Default
├── Gold
├── Danger
├── Compact
└── Disabled
```

Variant не должен быть независимой полной копией prefab.

```json
{
  "id": "variant_gold",
  "prefabRef": "prefab_primary_button",
  "overrides": {
    "backgroundAsset": "asset_button_gold",
    "labelColor": "#FFFFFF"
  }
}
```

---

# 23. Templates

Template — стартовая структура проекта.

Template может включать:

- scenes;
- prefabs;
- assets;
- folders;
- tokens;
- viewport presets;
- export settings;
- conventions;
- validation rules.

Template специализирует универсальный редактор под команду или жанр.

Примеры:

- Slot Game Starter;
- Mobile Puzzle Starter;
- RPG HUD Starter;
- Card Game Starter;
- Internal Studio UI Kit.

---

# 24. Responsive layout

Responsive layout — одна из центральных функций продукта.

Редактор должен позволять не только хранить координаты, но и описывать поведение объекта при изменении viewport.

Необходимо поддержать гибридную модель:

```text
Flow Layout
+
Constraint Layout
+
Absolute Positioning
```

## 24.1. Flow layout

Для:

- панелей;
- списков;
- наборов кнопок;
- строк;
- колонок;
- меню;
- контента;
- текстовых блоков.

Свойства:

- direction;
- gap;
- padding;
- align;
- justify;
- grow;
- shrink;
- wrap;
- width;
- height;
- min/max size;
- hug content;
- fill parent.

## 24.2. Constraint layout

Для художественного игрового интерфейса:

- left;
- right;
- top;
- bottom;
- center;
- proportional position;
- fixed aspect ratio;
- percentage size;
- safe-area offset;
- contain;
- cover;
- min/max scale.

## 24.3. Absolute layout

Для элементов, где необходим точный контроль.

Absolute positioning не отменяет responsive behavior. Объект может быть привязан к:

- parent center;
- viewport edge;
- safe area;
- sibling anchor;
- percentage coordinate.

---

# 25. Reference viewport

Каждая сцена должна иметь reference resolution.

```json
{
  "referenceViewport": {
    "width": 1920,
    "height": 1080
  }
}
```

Редактор должен различать:

- reference viewport;
- current preview viewport;
- device pixel ratio;
- safe area;
- crop area;
- visible bounds.

---

# 26. Viewport preview

Дизайнер должен иметь возможность переключать разрешения.

Примеры presets:

- 1920×1080;
- 2560×1440;
- 1366×768;
- tablet landscape;
- tablet portrait;
- mobile portrait;
- mobile landscape;
- ultra-wide;
- custom.

Preview должен показывать:

- реальный layout result;
- safe area;
- reference bounds;
- cropped regions;
- overflow;
- broken constraints;
- min/max size violations;
- clipping;
- text overflow;
- scale mode.

Важно, чтобы editor preview использовал тот же layout engine, что production runtime.

---

# 27. Orientation и breakpoints

Проект может поддерживать:

- landscape;
- portrait;
- automatic orientation;
- custom breakpoints;
- scene variants;
- conditional overrides.

Пример:

```json
{
  "responsiveOverrides": [
    {
      "when": {
        "orientation": "portrait"
      },
      "set": {
        "layout.direction": "column"
      }
    }
  ]
}
```

Breakpoints должны использоваться осторожно. Основой должна оставаться адаптивная layout-модель, а не отдельная ручная сцена для каждого разрешения.

---

# 28. Text nodes

Text node должен поддерживать:

- font family;
- bitmap font;
- font size;
- weight;
- style;
- line height;
- alignment;
- wrapping;
- overflow;
- auto-fit;
- min font size;
- max font size;
- localization key;
- fallback text;
- rich text в будущих версиях.

Пример:

```json
{
  "id": "node_balance_text",
  "type": "text",
  "text": {
    "mode": "localization",
    "key": "ui.balance",
    "fallback": "BALANCE"
  },
  "fit": {
    "mode": "shrink",
    "minFontSize": 18
  }
}
```

Preview должен позволять проверять длинные строки и разные языки.

---

# 29. Visual states

Редактор не должен хранить gameplay state machine, но должен позволять описывать presentation states.

Примеры:

- default;
- hover;
- pressed;
- disabled;
- selected;
- loading;
- hidden;
- attention;
- success;
- error.

```json
{
  "states": {
    "default": {},
    "pressed": {
      "transform.scale": 0.96
    },
    "disabled": {
      "alpha": 0.5
    }
  }
}
```

Runtime переключает состояние:

```ts
button.setState("disabled");
```

Решение о том, когда переключать состояние, остается в коде игры.

---

# 30. Runtime bindings

Bindings создают контракт между UI и игровым кодом.

Binding не должен совпадать с именем node.

```json
{
  "id": "node_primary_action",
  "name": "Spin Button",
  "binding": "actions.primary"
}
```

Разделение:

- `id` — внутренняя стабильная идентичность;
- `name` — пользовательское имя;
- `binding` — runtime-контракт;
- `assetRef` — ссылка на ресурс;
- `prefabRef` — ссылка на prefab.

Runtime API:

```ts
const primaryAction =
  screen.bindings.require("actions.primary");
```

---

# 31. Runtime slots

Для динамического контента должны использоваться slot nodes.

Примеры:

- gameplay viewport;
- particles layer;
- inventory content;
- character model;
- reels area;
- map content;
- dynamically generated list.

```json
{
  "id": "node_runtime_slot",
  "type": "slot",
  "slot": "gameplay.mainViewport"
}
```

Runtime:

```ts
const viewport =
  screen.slots.require("gameplay.mainViewport");

gameplayController.mount(viewport);
```

Редактор хранит только визуальное место вставки.

---

# 32. Runtime integration

Базовая схема:

```text
Published Package
        ↓
Package Loader
        ↓
Assets
        ↓
Scene Document
        ↓
Node Factory
        ↓
Layout Resolution
        ↓
Bindings and Slots
        ↓
Game Controllers
```

Пример API:

```ts
const ui = await uiLoader.load("game-ui-package/manifest.json", {
  viewport,
  localization,
  assetResolver
});

const screen = await ui.screens.open("main");

screen.bindings
  .require("actions.primary")
  .onPress(() => game.startAction());

const gameplaySlot =
  screen.slots.require("gameplay.mainViewport");

gameplayController.mount(gameplaySlot);
```

---

# 33. Один runtime для editor и game

Editor preview не должен иметь отдельную реализацию отображения документа.

Правильная схема:

```text
Web Editor Shell
        ↓
Production UI Runtime
        ↓
PixiJS Canvas
```

Неправильная схема:

```text
Editor Renderer
        ≠
Game Renderer
```

Editor и game должны использовать:

- одинаковый package loader;
- одинаковый node factory;
- одинаковый layout engine;
- одинаковый Spine adapter;
- одинаковые правила asset resolution;
- одинаковую schema validation.

Это минимизирует расхождения между preview и production.

---

# 34. Document schema

UI document должен быть декларативным.

Необходимо избегать прямой сериализации внутренних PixiJS объектов.

Плохо:

```json
{
  "class": "PIXI.Sprite",
  "position": {
    "x": 100,
    "y": 100
  }
}
```

Предпочтительно:

```json
{
  "type": "image",
  "assetRef": "asset_background",
  "layout": {
    "anchor": "center",
    "width": "fill",
    "height": "fill"
  }
}
```

Преимущества:

- независимость от изменений PixiJS API;
- понятная schema;
- миграции;
- headless validation;
- code generation;
- возможность других runtime adapters;
- удобство тестирования.

---

# 35. Package structure

Экспортируемый package может выглядеть так:

```text
game-ui-package/
├── manifest.json
├── scenes/
│   ├── main.json
│   ├── settings.json
│   └── bonus.json
├── prefabs/
│   ├── primary-button.json
│   └── modal.json
├── assets/
│   ├── textures/
│   ├── fonts/
│   └── spine/
└── generated/
    └── bindings.d.ts
```

Manifest:

```json
{
  "format": "game-ui-package",
  "schemaVersion": 1,
  "projectId": "project_game_42",
  "publishedRevision": 176,
  "entrypoints": {
    "main": "scenes/main.json",
    "settings": "scenes/settings.json"
  }
}
```

---

# 36. Export modes

Первая версия может поддерживать:

- Download ZIP;
- export directory;
- downloadable JSON package.

В будущем:

- REST API;
- CLI;
- CI integration;
- npm package;
- private registry;
- CDN publish;
- version pinning;
- incremental asset download.

---

# 37. TypeScript code generation

Для повышения надежности можно генерировать TypeScript-контракт.

```ts
interface MainScreenBindings {
  actions: {
    primary: UIButton;
    secondary: UIButton;
  };

  slots: {
    "gameplay.mainViewport": UIContainer;
    "fx.mainLayer": UIContainer;
  };

  text: {
    balance: UIText;
  };
}
```

Это позволит обнаруживать:

- отсутствующие bindings;
- несовместимые node types;
- переименованные contracts;
- удаленные slots;
- неправильное использование API.

---

# 38. Validation

Редактор должен валидировать проект до публикации.

Примеры ошибок:

- missing asset;
- deleted prefab;
- broken prefab override;
- duplicate binding;
- missing required slot;
- invalid Spine animation;
- incompatible Spine version;
- text overflow;
- invalid layout constraint;
- cyclic prefab dependency;
- unsupported asset type;
- invalid schema version;
- node outside allowed bounds;
- unresolved localization key.

Уровни:

- error — публикация запрещена;
- warning — публикация разрешена с предупреждением;
- info — рекомендация.

---

# 39. Revisions и публикация

Необходимо разделить:

```text
Draft
→ Review
→ Published Version
→ Export
```

Frontend-разработчик по умолчанию должен работать с опубликованной версией, а не с текущим draft.

Project state:

```json
{
  "revision": 183,
  "publishedRevision": 176
}
```

Функции:

- autosave;
- immutable revision history;
- named versions;
- publish;
- rollback;
- changelog;
- version comparison;
- author and timestamp.

---

# 40. Совместная работа

Для первой версии не обязательно реализовывать real-time multiplayer editing уровня Figma.

Минимально достаточно:

- cloud storage;
- project access;
- autosave;
- revision history;
- published version;
- lock или soft-lock редактируемой сцены;
- отображение автора изменений.

В будущем:

- simultaneous editing;
- comments;
- review mode;
- branches;
- merge;
- approval workflow.

---

# 41. Undo/redo и editor reliability

Для production-редактора обязательны:

- undo;
- redo;
- autosave;
- crash recovery;
- deterministic serialization;
- stable ordering;
- copy/paste;
- duplicate;
- multi-select;
- grouping;
- history transaction;
- keyboard shortcuts;
- validation after operations.

Качество этих функций напрямую определяет, смогут ли дизайнеры использовать продукт ежедневно.

---

# 42. Editor UX

Основные области интерфейса:

```text
┌──────────────────────────────────────────────────────┐
│ Toolbar / Viewport / Preview / Publish              │
├──────────────┬──────────────────────┬────────────────┤
│ Scene Tree   │ Canvas               │ Inspector      │
│ Prefabs      │                      │ Layout         │
│ Assets       │                      │ States         │
│              │                      │ Bindings       │
├──────────────┴──────────────────────┴────────────────┤
│ Validation / Animation / History                    │
└──────────────────────────────────────────────────────┘
```

Основные canvas-функции:

- select;
- move;
- resize;
- rotate;
- pan;
- zoom;
- snapping;
- guides;
- rulers;
- alignment;
- distribution;
- parent selection;
- isolation mode;
- prefab edit mode;
- preview mode.

---

# 43. Design tokens

В будущем проект может содержать tokens:

- colors;
- spacing;
- border radius;
- typography;
- opacity;
- animation duration;
- standard sizes;
- safe-area margins.

```json
{
  "tokens": {
    "spacing.md": 16,
    "spacing.lg": 32,
    "color.primary": "#FFCC00"
  }
}
```

Tokens позволяют централизованно менять визуальные параметры.

Для MVP они полезны, но не обязательны, если замедляют основной pipeline.

---

# 44. Расширяемость

В перспективе редактор может поддерживать:

- plugin API;
- custom node types;
- custom inspectors;
- custom validators;
- custom export adapters;
- custom runtime components;
- shader previews;
- custom asset processors;
- studio-specific integrations.

Расширяемость не должна приводить к тому, что базовые проекты перестают быть переносимыми или валидируемыми.

---

# 45. Безопасность документа

Документная модель должна защищать проект от случайных поломок.

Необходимо предусмотреть:

- stable IDs;
- schema validation;
- reference validation;
- transactional changes;
- migration pipeline;
- soft delete;
- asset usage checks;
- prefab dependency checks;
- revision rollback.

---

# 46. Versioning и migrations

Schema versioning необходимо заложить с первой версии.

```json
{
  "format": "game-ui",
  "schemaVersion": 1,
  "editorVersion": "0.1.0"
}
```

При изменении формата:

```ts
migrateV1ToV2(document);
migrateV2ToV3(document);
```

Миграции должны быть:

- последовательными;
- тестируемыми;
- обратимо сохраняемыми через revision;
- применяемыми на backend или client;
- совместимыми с published packages.

---

# 47. Нефункциональные требования

## 47.1. Производительность

Редактор должен работать с:

- большими сценами;
- большим количеством nodes;
- несколькими Spine-анимациями;
- крупными текстурами;
- вложенными prefabs;
- несколькими viewport previews.

Необходимо учитывать:

- lazy loading;
- texture memory;
- asset thumbnails;
- hierarchy virtualization;
- incremental save;
- background asset processing.

## 47.2. Надежность

- отсутствие потери данных;
- предсказуемый undo/redo;
- стабильный export;
- deterministic JSON;
- понятные ошибки;
- backward compatibility.

## 47.3. Безопасность

- project access control;
- signed asset URLs;
- upload validation;
- file size limits;
- MIME validation;
- isolation of user content;
- protection from malicious files.

---

# 48. Что должно войти в концептуальный MVP

Концептуальный MVP должен доказать полный pipeline:

```text
Designer assembles UI
        ↓
Designer previews responsiveness
        ↓
Designer publishes version
        ↓
Developer downloads package
        ↓
PixiJS runtime renders the same UI
        ↓
Developer attaches game logic
```

Минимальные функции:

## Projects

- создание проекта;
- открытие проекта;
- сохранение;
- autosave.

## Scenes

- создание сцены;
- scene tree;
- root node;
- reference viewport.

## Nodes

- Container;
- Image;
- styled Text;
- Spine;
- Prefab Instance;
- Button;
- Horizontal / Vertical / Grid Layout Group;
- Scroll View;
- single-line Input;
- horizontal Slider;
- left-to-right Progress Bar.

## Canvas

- selection;
- move;
- resize;
- rotate;
- zoom;
- snapping;
- hierarchy editing.

## Assets

- upload image;
- upload font;
- upload Spine package;
- asset library;
- select another asset;
- replace asset source;
- find usages;
- delete validation.

## Prefabs

- create prefab;
- create instance;
- exposed property;
- override;
- reset override;
- nested prefab;
- detach.

## Responsive layout

- anchor constraints;
- percentage sizing;
- min/max size;
- flow container;
- viewport presets;
- safe area preview.

## Runtime contract

- stable IDs;
- bindings;
- slots;
- validation.

## Export

- versioned JSON;
- assets;
- manifest;
- ZIP package.

## PixiJS runtime

- package loading;
- node creation;
- layout resolution;
- asset resolution;
- Spine rendering;
- bindings and slots.

## Versioning

- revision;
- published version;
- rollback.

---

# 49. Что можно отложить

Необязательно для первой версии:

- real-time collaboration;
- comments;
- branching;
- plugin marketplace;
- AI generation;
- full animation timeline;
- advanced shaders editor;
- theme marketplace;
- npm publishing;
- advanced permissions;
- multi-engine runtime;
- full localization platform;
- design token editor;
- template marketplace.

---

# 50. Основные продуктовые риски

## 50.1. Слишком широкий scope

Редактор легко может превратиться в попытку повторить Figma, Unity и Spine одновременно.

Необходимо сохранять фокус:

> Сборка игрового UI из готовых ассетов, responsive layout, prefabs, preview и export.

## 50.2. Разница между preview и game

Если editor и game используют разный runtime, доверие к продукту будет быстро потеряно.

## 50.3. Слабая prefab model

Если prefab реализован как copy/paste, проект станет трудно поддерживать.

## 50.4. Нестабильные ссылки

Если ссылки основаны на именах и путях, изменения дизайна будут ломать integration.

## 50.5. Сложный UX

Технически правильный редактор может быть непригоден для дизайнеров, если базовые операции неудобны.

## 50.6. Непродуманная asset model

Замена файлов, переиспользование ассетов и поиск зависимостей должны быть частью основы, а не поздним дополнением.

## 50.7. Чрезмерная привязка к PixiJS internals

UI schema должна быть декларативной и стабильной.

---

# 51. Критерии успеха

Продукт можно считать успешным, если:

- дизайнер самостоятельно собирает все основные экраны;
- дизайнер проверяет результат на нескольких разрешениях;
- Spine-анимации видны в контексте сцены;
- замена ассета не ломает ссылки;
- изменения prefab распространяются на instances;
- frontend не пересобирает UI вручную;
- runtime отображает тот же результат, что editor preview;
- gameplay подключается через bindings и slots;
- опубликованный package можно однозначно воспроизвести;
- новая версия UI может быть интегрирована без ручного повторения всей верстки.

---

# 52. Ожидаемый итоговый workflow

## Работа дизайнера

```text
Create/Open Project
        ↓
Upload Assets
        ↓
Create Prefabs
        ↓
Assemble Screens
        ↓
Configure Layout
        ↓
Preview Viewports
        ↓
Validate
        ↓
Publish Version
```

## Работа frontend-разработчика

```text
Open Published Version
        ↓
Download UI Package
        ↓
Add Package to Game
        ↓
Load through PixiJS Runtime
        ↓
Attach Controllers
        ↓
Implement Gameplay
```

## Обновление дизайна

```text
Designer changes nodes/assets/prefabs
        ↓
Publishes new revision
        ↓
Developer updates package
        ↓
Stable IDs and bindings remain valid
```

---

# 53. Итоговая формулировка концепции

Мы хотим создать универсальный веб-сервис для визуальной сборки игровых интерфейсов.

Сервис должен позволить дизайнерам самостоятельно собирать игровые экраны из изображений, текста, Spine-анимаций и префабов, настраивать адаптивное поведение и проверять результат на разных разрешениях.

Визуальные объекты должны иметь стабильную идентичность, независимую от имени и назначенного ассета. Дизайнер должен иметь возможность заменять изображения и другие ресурсы без нарушения ссылок, layout, prefab instances и runtime contracts.

Редактор не должен содержать жанровую игровую логику. Универсальность достигается за счет пользовательских префабов, библиотек и шаблонов проектов.

Результатом работы является versioned UI package, содержащий декларативную структуру сцен, ассеты, префабы, layout rules, bindings и manifest.

PixiJS runtime загружает этот package и создает визуальную hierarchy. Игровой код подключает поведение, данные и динамические системы через bindings и slots.

Ключевой принцип:

```text
Editor owns presentation.
Game code owns behavior.
Stable document model connects them.
```
