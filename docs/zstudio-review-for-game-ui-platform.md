# Ревью zStudio для реализации Game UI Authoring Platform

> Цель документа — использовать zStudio как продуктовый и технический reference при разработке собственного прототипа, не копируя ограничения его runtime-модели.
>
> Ревью основано на публичном сайте zStudio, tutorial/product materials и открытом TypeScript importer для PixiJS 8. Состояние материалов проверено 10 июля 2026 года. Исходный код desktop editor публично не анализировался, поэтому выводы о его внутренних механизмах ограничены наблюдаемым UX и экспортируемым runtime API.

## 1. Краткий вывод

zStudio — самый близкий из рассмотренных продуктов к нашему целевому workflow:

```text
Artist / technical artist
        ↓
Visual scene authoring
        ↓
Responsive layouts and templates
        ↓
JSON/assets export
        ↓
PixiJS importer
        ↓
Game code attaches behavior
```

Он подтверждает несколько ключевых продуктовых гипотез:

- дизайнер способен владеть визуальной сборкой сцены;
- desktop/mobile layouts необходимо редактировать визуально;
- templates/instances должны быть центральной частью workflow;
- Spine и bitmap fonts должны отображаться непосредственно в сцене;
- разработчику нужен простой importer, а не ручное воспроизведение hierarchy;
- live test mode и быстрый export важнее большого количества enterprise-функций на раннем этапе.

При этом zStudio не следует копировать как canonical architecture. Наш продукт должен сохранить его скорость authoring, но добавить более строгую document model:

- stable IDs независимо от names;
- явное разделение Node и Asset;
- versioned document schema;
- shared scene hierarchy для desktop/mobile;
- profile overrides вместо двух независимых сцен;
- immutable published packages;
- generic runtime integration без встроенной игровой семантики;
- web-first project workflow.

---

## 2. Что у zStudio совпадает с нашей задачей

### 2.1. Artist-owned pipeline

zStudio прямо строится вокруг устранения ручного layout-кода: художник собирает responsive scene, а разработчик загружает ее через importer и занимается логикой.

Это полностью совпадает с нашим главным продуктовым обещанием:

```text
Editor owns presentation.
Game code owns behavior.
```

### 2.2. Поддержка разных aspect ratios — часть основы

zStudio подчеркивает portrait, landscape, desktop и другие размеры как базовый сценарий. В открытом PixiJS importer orientation data является частью `ZContainer`, а изменения `x`, `y`, `scale`, `width` и `height` сохраняются для активной orientation.

Для нас главный вывод:

> Нельзя строить сначала desktop-сцену, а mobile layout добавлять позднее как дополнительную функцию.

В нашем MVP обязательны два named layout-профиля:

- `desktop`;
- `mobile`.

Оба профиля должны существовать с первой рабочей версии scene authoring.

### 2.3. Templates как основной механизм reuse

zStudio использует templates и instances для повторно используемых hierarchies. По продуктовой модели это очень близко к нашим prefabs:

- definition редактируется отдельно;
- instances создаются в сценах;
- templates могут вкладываться;
- instance можно отделить от template;
- готовые элементы можно переносить между сценами.

Это подтверждает, что prefab system нельзя оставлять на далекое будущее. Для реального пилота она должна появиться сразу после базовой scene/layout модели.

### 2.4. Полноценные игровые ассеты в editor

zStudio работает не только с PNG:

- images и atlases;
- text и bitmap fonts;
- Spine;
- particles;
- nine-slice;
- animated content.

Наш прототип не обязан повторять весь список, но Image, Text, Spine и reusable prefab должны быть проверены на реальном экране.

### 2.5. Простой importer workflow

Открытый `zImporter` показывает важное качество developer experience:

- сцена загружается отдельным объектом;
- resize прокидывается централизованно;
- templates можно spawn-ить;
- hierarchy доступна игровому коду;
- underlying Pixi/Spine objects можно получить при необходимости.

Наш runtime API также должен быть небольшим. Разработчик не должен понимать внутренний формат export package, чтобы показать сцену и найти нужный UI-узел.

### 2.6. Live test mode и runtime-oriented preview

zStudio делает акцент на live test mode. Это продуктово важнее, чем статичный preview:

- анимации проигрываются в контексте;
- hierarchy ведет себя как в runtime;
- orientation/aspect-ratio переключение проверяется до передачи разработчику.

Для нас это усиливает требование: editor и demo-game используют один production runtime package.

### 2.7. Быстрый authoring UX

Полезные UX-ориентиры:

- drag-and-drop import;
- hierarchy tree;
- inspector;
- context menus;
- hotkeys;
- undo/redo;
- live preview;
- templates;
- переключение layout/orientation;
- создание placeholder assets.

На стадии прототипа скорость основных операций важнее глубины настройки редких свойств.

---

## 3. Обязательная модель desktop/mobile в нашем продукте

### 3.1. Не два viewport preset, а два layout-профиля

Viewport preset — только конкретный размер preview, например:

```text
Desktop 1920×1080
Desktop 1366×768
Mobile 390×844
Mobile 360×800
```

Layout profile — ветка presentation overrides, которая применяется к диапазону viewport.

```text
Scene
├── shared hierarchy
├── shared assets
├── shared bindings
├── shared prefab instances
├── desktop overrides
└── mobile overrides
```

### 3.2. Что остается общим

Между desktop и mobile нельзя дублировать:

- node hierarchy;
- stable node IDs;
- asset references;
- binding aliases;
- prefab definition references;
- exposed property values, если они не переопределены явно;
- runtime identity.

### 3.3. Что может отличаться

Profile override может изменять presentation properties:

- position;
- size;
- scale;
- anchor/constraints;
- flow direction;
- gap/padding;
- visibility;
- asset reference, если mobile действительно использует другой визуальный ресурс;
- prefab variant или exposed property;
- Spine animation/skin preview defaults, если это необходимо presentation design.

### 3.4. Что не должно происходить

Запрещенная модель:

```text
DesktopSceneCopy
MobileSceneCopy
```

Она приводит к:

- расхождению stable IDs;
- двойному обновлению prefabs;
- различающимся bindings;
- ручному переносу изменений;
- скрытым ошибкам export;
- невозможности однозначно сравнить две версии одной сцены.

### 3.5. Profile resolver

Editor и runtime используют одну функцию выбора профиля:

```ts
type LayoutProfileId = "desktop" | "mobile";

function resolveLayoutProfile(
  viewport: { width: number; height: number },
  settings: LayoutProfileSelectionSettings,
): LayoutProfileId;
```

Для MVP достаточно одного project-level правила на основе aspect ratio. Точный threshold определяется после проверки реальных целевых viewport.

Важно не конкретное число breakpoint, а следующие свойства:

- resolver детерминирован;
- правило хранится в package;
- editor preview использует этот же resolver;
- viewport около breakpoint покрыт тестами;
- разработчик при необходимости может явно override-нуть профиль для диагностики.

### 3.6. Validation и publish

Publish проверяет обе ветки:

- все required assets доступны;
- hierarchy разрешается без конфликтов;
- prefab overrides валидны;
- нет critical overflow;
- binding aliases не конфликтуют;
- text не выходит за допустимые границы;
- reference viewport определен;
- runtime может materialize обе версии render tree.

Broken mobile profile должен блокировать публикацию даже при полностью рабочем desktop profile, и наоборот.

---

## 4. Что стоит перенять из zStudio

### 4.1. Явный режим редактирования профиля

В toolbar всегда видно, какой профиль активен:

```text
Layout: Desktop | Mobile
Viewport: 1920×1080
```

Изменение profile-specific свойства должно быть визуально отличимо от изменения общего base property.

Минимальный UX:

- `Desktop` / `Mobile` switcher;
- indicator `Base` или `Override` около свойства;
- `Reset profile override`;
- preview нескольких размеров текущего профиля;
- быстрый side-by-side или sequential check перед publish.

### 4.2. Centralized resize handling

zImporter централизованно обрабатывает resize через scene stack. У нас layout recalculation также должен находиться в runtime, а не распределяться по editor components или игровому коду.

```text
viewport changed
→ resolve profile
→ resolve layout
→ update render tree
```

### 4.3. Templates доступны без сложной настройки

Создание prefab должно быть короткой операцией:

```text
Select hierarchy
→ Create Prefab
→ Name
→ Create Instance
```

Exposed properties можно добавлять позже, не заставляя пользователя сначала проектировать полный public API компонента.

### 4.4. Underlying runtime object доступен как escape hatch

Для интеграции иногда потребуется настоящий `PIXI.Container`, `PIXI.Text` или Spine object. Runtime должен позволять получить display object из generic mounted node.

Это escape hatch, а не основной document contract.

### 4.5. Быстрый asset flow

Приоритетные операции:

- drag/drop upload;
- thumbnail;
- назначение asset выбранному node;
- replace source с сохранением asset ID;
- find usages;
- preview Spine animations;
- понятная ошибка несовместимой версии.

### 4.6. Runtime integration должна помещаться в несколько строк

Целевой developer flow:

```ts
const ui = await loadUIPackage(url, { viewport });
const scene = await ui.openScene("main");

scene.requireBinding("primaryAction")
  .displayObject
  .on("pointertap", onPrimaryAction);
```

Сложность prefab resolution, asset paths и profile selection скрывается внутри package loader/runtime.

---

## 5. Что не следует копировать напрямую

### 5.1. Контракты по display name

В публичных примерах zStudio используются lookup и spawn по строковым именам:

```ts
sceneStage.get("myBTN");
ZSceneStack.spawn("RobotWalker");
```

Для быстрого workflow это удобно, но имя пользователя не должно быть постоянной identity.

Наша модель:

```text
stable ID — системная identity;
name — свободно редактируемый display label;
binding — опциональный user-defined runtime alias.
```

### 5.2. Magic child names

`ZButton` распознает специальные имена детей:

- `upState`;
- `downState`;
- `overState`;
- `disabledState`;
- `labelContainer`.

Это ускоряет создание готового control, но превращает naming convention в скрытый protocol.

В нашем core такие имена не должны иметь встроенного поведения. Подобные conventions могут существовать внутри конкретной prefab library/template package.

### 5.3. Document model не должна зависеть от готовых runtime controls

zImporter предоставляет `ZButton`, `ZSlider`, `ZToggle`, `ZTimeline`, `ZState` и другие классы.

Наш MVP не должен превращаться в UI component framework. Базовый editor отвечает за presentation hierarchy. Готовые controls строятся как prefabs/templates и подключаемые runtime helpers.

### 5.4. Runtime setters не должны быть единственным способом сохранить layout state

В zImporter рекомендуется изменять transform через `setX`, `setY`, `setScale`, потому что значения хранятся отдельно для active orientation.

В нашей архитектуре source of truth — document/state layer, а Pixi objects являются materialized view:

```text
Editor command or runtime presentation override
→ document/runtime state
→ layout resolve
→ Pixi display tree update
```

Прямая мутация Pixi object может быть временной runtime animation, но не должна незаметно менять canonical desktop/mobile layout.

### 5.5. Timeline не входит в MVP

Visual keyframe timeline — сильное преимущество zStudio, но это отдельная большая подсистема:

- keyframes;
- easing;
- cue points;
- playback state;
- serialization;
- editor UX;
- runtime synchronization.

Для MVP достаточно:

- Spine preview;
- visual states или простых property presets при подтвержденном кейсе;
- возможности игрового кода управлять animation runtime.

Timeline рассматривается только после подтверждения основного UI authoring pipeline.

### 5.6. Не смешивать scene authoring и behavior framework

zStudio частично берет на себя interactive components. Наше ядро должно оставаться genre-agnostic и behavior-light.

Допустимо:

- pointer-enabled flag;
- presentation states;
- generic binding;
- runtime access to node/display object.

Не требуется в core MVP:

- game action graph;
- navigation logic;
- inventory/reels semantics;
- жанровые controls;
- gameplay state machines.

### 5.7. Не принимать desktop editor workflow как единственную модель

zStudio распространяется как desktop editor. Это удобно для local authoring и тяжелых assets, но наша целевая концепция остается web-first:

- project URL;
- shared project storage;
- autosave;
- publish versions;
- доступ разработчика к тому же проекту;
- будущий review/collaboration workflow.

При этом полезно сохранить desktop-like performance и shortcuts в браузерном shell.

---

## 6. Сравнение целевых моделей

| Область | zStudio reference | Наша целевая модель |
|---|---|---|
| Authoring | Desktop visual editor | Web-first visual editor |
| Rendering target | PixiJS, Phaser, HTML | PixiJS first |
| Layout modes | Portrait/landscape orientation data и anchors | Mandatory `desktop`/`mobile` profiles + responsive rules внутри профиля |
| Scene identity | Публичный API активно использует names | Stable IDs + optional aliases |
| Reuse | Templates and instances | Prefabs/templates with explicit overrides |
| Assets | Drag/drop, atlases, Spine, fonts | Stable asset records + replace-source semantics |
| Runtime | `Z*` wrapper classes над Pixi | Generic mounted nodes + Pixi adapter/escape hatch |
| Controls | Built-in button/slider/toggle/state/timeline classes | Prefab libraries и optional runtime helpers |
| Animation | Visual timeline + Spine | Spine first; timeline после MVP |
| Export | JSON/assets via importer | Versioned immutable package + manifest + assets |
| Versioning | Публично не подтвержден как основной workflow | Draft → publish → immutable version → rollback |
| Collaboration | Scene viewers доступны в team plan | Не MVP; cloud project foundation закладывается |

---

## 7. Изменения, которые должны попасть в наш backlog

### P0

- Ввести обязательные layout profiles `desktop` и `mobile` в schema v0.
- Хранить одну hierarchy с profile overrides.
- Добавить reference viewport для каждого профиля.
- Реализовать один profile resolver для editor и runtime.
- Добавить profile switcher в toolbar.
- Добавить минимум два preview viewport на профиль.
- Сделать validation обоих профилей обязательной для publish.
- Добавить golden tests для обоих профилей и viewport около breakpoint.
- Проверить real screen, где mobile layout требует не только scale, но и reposition/reflow элементов.
- Встроить shared production runtime в editor preview.
- Сделать asset drag/drop и Spine preview частью раннего пилота.

### P1

- Side-by-side compare desktop/mobile.
- Copy selected property values between profiles.
- Reset all overrides for selected node/profile.
- Profile-specific visibility и asset override.
- Prefab editor с preview обоих профилей.
- Visual diff profile override против base.
- Project/template-defined viewport preset libraries.

### Не включать до MVP validation

- visual timeline;
- cue points;
- готовую library controls в core;
- particles editor;
- AI placeholder generation;
- Phaser/HTML runtime targets;
- arbitrary number of user-created breakpoints;
- behavior graph.

---

## 8. Тестовый пилот на основе сильных сторон zStudio

Для проверки архитектуры нужен экран, который содержит:

- background с cover/contain behavior;
- несколько anchored UI blocks;
- central Spine character/animation;
- две или более prefab button instances;
- текст с разной длиной;
- desktop layout;
- существенно отличающийся mobile layout;
- хотя бы один элемент, скрытый или перемещенный только в mobile;
- один dynamic host container, доступный по stable ID или generic binding;
- замену source у общего asset;
- публикацию package и загрузку в runtime-demo.

Пилот должен ответить на вопросы:

1. Можно ли получить хороший desktop и mobile результат без копирования scene hierarchy?
2. Понимает ли дизайнер, когда он меняет base property, а когда profile override?
3. Сохраняются ли stable IDs и bindings при переключении профиля?
4. Обновляется ли prefab одновременно в обоих профилях?
5. Совпадает ли editor preview с runtime-demo?
6. Можно ли заменить asset source без повторной настройки обоих профилей?
7. Достаточны ли anchors/flow/min-max или нужен еще один layout primitive?
8. Может ли разработчик подключить поведение без знания export JSON?

---

## 9. Рекомендация по использованию zStudio во время разработки

zStudio стоит использовать параллельно в трех ролях.

### 9.1. UX benchmark

Перед реализацией крупной editor-функции проверить, как аналогичная операция решена в zStudio:

- import;
- hierarchy;
- templates;
- orientation switch;
- Spine preview;
- test mode;
- export.

Цель — не повторить интерфейс, а не изобретать заведомо медленный workflow.

### 9.2. Product benchmark

Наш прототип должен как минимум не проигрывать zStudio в основном сценарии:

```text
import assets
→ assemble scene
→ configure desktop/mobile
→ reuse prefab
→ preview
→ export
→ load in PixiJS
```

Наше преимущество должно быть не количеством controls, а надежностью source-of-truth модели:

- stable references;
- asset replacement;
- publish versions;
- web access;
- deterministic package;
- единый runtime.

### 9.3. Technical anti-pattern reference

Открытый importer полезно регулярно проверять как пример реальных компромиссов production authoring tool:

- name-based API;
- orientation state в wrapper objects;
- magic naming conventions;
- готовые runtime controls;
- centralized resize;
- direct access to underlying Spine/Pixi objects.

Часть решений стоит перенять, а часть — сознательно исключить и закрепить ADR.

---

## 10. Итог

zStudio подтверждает, что наш продуктовый концепт реалистичен и востребован. Наиболее важные выводы для прототипа:

1. `desktop` и `mobile` — обязательные layout-профили с первой версии.
2. Дизайнер должен явно редактировать и проверять оба профиля.
3. Scene hierarchy не дублируется; профили содержат только overrides.
4. Templates/prefabs и Spine нужны раньше сложных cloud-функций.
5. Editor preview и runtime должны максимально совпадать.
6. Importer API должен быть небольшим и понятным.
7. Stable IDs и versioned packages должны исправить слабые места name-based authoring tools.
8. Timeline, built-in controls и multi-engine support не должны размывать MVP.

Целевая формула:

```text
Скорость и удобство zStudio
+
строгая document model
+
обязательные desktop/mobile profiles
+
web-first publish workflow
=
наш прототип
```

---

## 11. Публичные материалы

- Product overview: https://zstudiosltd.com/
- Tutorials: https://zstudiosltd.com/tutorials/
- Pricing and desktop editor plans: https://zstudiosltd.com/pricing/
- PixiJS 8 importer: https://github.com/zStudiosLTD/zImporter_PIXI8
- Importer README/API: https://github.com/zStudiosLTD/zImporter_PIXI8/blob/main/README.md
