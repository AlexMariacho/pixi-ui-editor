# План реализации Game UI Authoring Platform и backlog MVP

> Документ подготовлен на основе концепции веб-сервиса для визуальной сборки игрового UI на PixiJS.
>
> Фокус текущего этапа — быстро доказать жизнеспособность полного pipeline, а не построить production-аналог Figma.
>
> Версия 3 уточняет обязательную поддержку двух layout-профилей (`desktop` и `mobile`) и учитывает разборы `sw1f1s/pixi-ui-editor` и zStudio.

---

## 1. Цель MVP

MVP должен доказать один сквозной сценарий:

```text
Дизайнер создает проект
        ↓
Загружает изображения и Spine-ассет
        ↓
Собирает одну или несколько сцен
        ↓
Настраивает обязательные layout-профили desktop и mobile
        ↓
Создает и использует простой prefab
        ↓
Назначает generic bindings на нужные UI-узлы
        ↓
Публикует версию и скачивает package
        ↓
PixiJS runtime загружает package
        ↓
Демо-игра подключает поведение через bindings
```

Главный критерий MVP: **один и тот же runtime отображает документ внутри редактора и внутри тестовой игры без ручной пересборки UI**.

---

## 2. Продуктовая гипотеза

Гипотеза считается подтвержденной, если дизайнер или technical artist без изменения игрового кода может:

- изменить расположение и размеры элементов;
- заменить изображение, сохранив стабильные ссылки;
- изменить prefab и получить обновление его instances;
- проверить сцену в двух обязательных layout-профилях: `desktop` и `mobile`;
- проверить несколько viewport внутри каждого профиля;
- опубликовать новую версию;
- передать package разработчику;
- увидеть те же изменения в PixiJS-приложении после обновления package.

На этом этапе не требуется доказывать масштабирование на большие команды, сложные проекты или real-time collaboration.

---

## 3. Принципы реализации

### 3.1. Вертикальный срез важнее полноты подсистем

Каждый этап должен заканчиваться работающим сквозным сценарием. Не следует сначала несколько месяцев строить отдельно редактор, backend и runtime.

### 3.2. Runtime создается раньше полноценного editor UX

Сначала необходимо зафиксировать декларативную schema и научиться воспроизводить ее в PixiJS. Редактор должен быть визуальным способом изменения этой schema.

### 3.3. Editor preview использует production runtime

Редактор не реализует собственный renderer. Canvas редактора встраивает тот же runtime package, который будет использовать игра.

### 3.4. Stable ID вводится с первой версии

Node, asset, scene и prefab получают UUID при создании. Имена используются только для отображения и не участвуют в ссылках.

### 3.5. Prototype-first backend

Для первого вертикального среза допустимо локальное хранение проекта. Backend подключается после стабилизации document schema и базового editor flow.

### 3.6. Все спорные функции сначала делаются в минимальном варианте

Примеры:

- вместо полного constraint solver — ограниченный набор anchor rules;
- вместо полноценной истории веток — draft и immutable published snapshots;
- вместо сложных prefab variants — definition, instance и property overrides;
- вместо универсальной animation timeline — только preview Spine animation;
- вместо production-grade permission model — владелец проекта и общий доступ по ссылке или workspace.

### 3.7. Core и runtime не содержат игровую семантику

Ядро знает только универсальные UI-сущности и не содержит предопределенных контрактов вроде `gameplayViewport`, `inventoryContent`, `reelsArea` или других жанровых понятий.

Для связи с кодом допускается только универсальный механизм:

- stable node ID;
- опциональный user-defined binding/alias на UI-узле;
- generic lookup узла или его Pixi display object в runtime.

Значения bindings определяются проектом, prefab library или template. Runtime воспринимает их как непрозрачные строки и не знает их бизнес-смысла.

Необходимо различать два понятия:

- **Prefab content slot** — внутренняя точка композиции reusable prefab, куда instance передает вложенный UI-контент;
- **Runtime mount point** — обычный `Container`, который при необходимости доступен игровому коду через stable ID или generic binding.

Отдельный node type `Slot`, `SlotRegistry` и специальный публичный slots API в MVP не нужны. Prefab slots можно добавить позднее как часть prefab resolution, не превращая их в игрозависимый runtime-контракт.

### 3.8. Два layout-профиля обязательны

Каждая публикуемая сцена обязана поддерживать два named layout-профиля:

- `desktop` — широкие desktop/browser viewport;
- `mobile` — мобильные viewport, обычно с существенно более узким aspect ratio.

Это не два необязательных preview preset и не две копии сцены. Используется одна scene hierarchy, общие stable IDs, assets, bindings и prefab instances. Профили хранят только отличающиеся presentation-свойства и layout overrides.

Базовая модель:

```text
Shared scene hierarchy and content
        +
Desktop layout overrides
        +
Mobile layout overrides
```

Runtime детерминированно выбирает профиль по viewport и project settings. Точный breakpoint или правило выбора конфигурируется проектом, но список обязательных профилей в MVP фиксирован: `desktop` и `mobile`.

Внутри каждого профиля responsive layout продолжает работать на диапазоне размеров. Профиль не должен создаваться для каждого отдельного разрешения.

Публикация блокируется, если сцена невалидна хотя бы в одном из двух профилей.

---

## 4. Границы MVP

### 4.1. Входит в MVP

- создание и открытие проекта;
- одна рабочая область без real-time collaboration;
- сцены с reference viewport;
- node hierarchy;
- `Container`, `Image`, styled `Text`, `Spine`, `PrefabInstance`, button, scroll view, single-line input, horizontal slider и progress bar;
- выбор, перемещение, resize и базовый rotate;
- inspector основных свойств;
- загрузка изображений, font-assets и Spine package;
- разделение `Node` и `Asset`;
- `Select another asset` и `Replace asset source`;
- anchors со stretch и horizontal/vertical/grid layout groups;
- обязательные layout-профили `desktop` и `mobile`;
- несколько viewport presets внутри каждого профиля и safe area overlay;
- prefab definition, instance и overrides;
- generic bindings и lookup UI-узлов по stable ID;
- базовая validation;
- draft autosave;
- immutable published version;
- экспорт ZIP package;
- PixiJS runtime loader;
- тестовое PixiJS-приложение, подключающее поведение к bindings.

### 4.2. Сознательно упрощается

- только один пользователь редактирует сцену одновременно;
- один workspace или простая модель владельца проекта;
- один уровень undo/redo command stack для основных операций;
- ровно два обязательных layout-профиля в MVP: `desktop` и `mobile`;
- ограниченный набор layout rules внутри каждого профиля;
- без произвольного breakpoint editor: правило выбора профиля задается одной project setting;
- prefab nesting можно ограничить одним уровнем;
- только простые exposed properties: `string`, `number`, `boolean`, `asset`, `visibility`;
- простой список опубликованных версий без визуального diff;
- rollback реализуется восстановлением snapshot в новый draft;
- без rich text и полноценной localization system;
- без generated TypeScript API на первой демонстрации, но schema должна позволять добавить его далее.

### 4.3. Не входит в MVP

- real-time multiplayer editing;
- комментарии и review workflow;
- branches и merge;
- plugin API;
- marketplace;
- сложные variants и design tokens editor;
- full animation timeline;
- shader editor;
- несколько runtime targets;
- CI/CD publish и npm registry;
- сложная ролевая модель;
- отдельные сцены или шаблоны для игровых жанров.

---

## 5. Предлагаемая техническая структура

### 5.1. Monorepo

```text
apps/
├── editor-web/          # Web shell, panels, canvas tools
├── api/                 # Projects, assets, drafts, publish
└── runtime-demo/        # Минимальная PixiJS-игра для проверки integration

packages/
├── schema/              # Типы документа, JSON Schema, migrations
├── runtime-pixi/        # Loader, node factory, layout, node lookup, bindings, Spine adapter
├── editor-core/         # Commands, selection, hierarchy operations
├── exporter/            # Manifest, package assembly, ZIP
├── validators/          # Headless validation rules
└── shared/              # IDs, errors, utility types
```

Рекомендуется TypeScript во всех пакетах, чтобы editor, backend и runtime использовали одни контракты.

### 5.2. Frontend editor

Базовые зоны:

```text
Toolbar
├── Project / Scene selector
├── Viewport selector
├── Preview
└── Publish

Left panel
├── Scene Tree
├── Assets
└── Prefabs

Center
└── PixiJS Canvas + editor overlays

Right panel
├── Transform
├── Node properties
├── Layout
├── Asset reference
└── Binding / Node identity

Bottom panel
└── Validation / Console
```

DOM рекомендуется использовать для shell и inspector, PixiJS — для scene rendering. Selection bounds, resize handles и guides можно реализовать отдельным editor overlay поверх runtime scene.

### 5.3. Backend

Минимальные сущности:

```text
Project
├── currentDraft
├── assets
├── publishedVersions
└── metadata

PublishedVersion
├── immutable document snapshot
├── referenced asset versions
├── manifest
└── export artifact
```

Минимальные хранилища:

- relational DB для проектов и метаданных;
- object storage для исходных ассетов и export artifacts;
- JSON document snapshot для draft и published versions.

На прототипе допустимо хранить draft целиком. Incremental operations и collaborative document model пока не нужны.

### 5.4. Runtime

```text
PackageLoader
    ↓
SchemaValidator
    ↓
AssetResolver
    ↓
PrefabResolver
    ↓
NodeFactory
    ↓
LayoutEngine
    ↓
NodeIndex / BindingIndex
    ↓
PixiJS Display Tree
```

Runtime API первой версии может быть минимальным:

```ts
const ui = await loadUIPackage(packageUrl, { viewport }); // runtime resolves desktop/mobile profile
const screen = await ui.openScene("main");

const actionNode = screen.requireBinding("primaryAction");
actionNode.displayObject.on("pointertap", startGame);

const hostNode = screen.findById("node_content_host");
hostNode.displayObject.addChild(dynamicContent);
```

`primaryAction` и `node_content_host` определены конкретным проектом или template. Runtime не приписывает им игрового смысла и не содержит отдельных API для жанровых сущностей.

---

## 6. Document schema v3

Для первого vertical slice достаточно следующих сущностей:

```text
ProjectDocument
├── schemaVersion
├── project
├── scenes[]
├── prefabs[]
├── assets[]
└── settings
    └── layoutProfileSelection
```

### 6.1. Базовый node

```ts
type UINode = {
  id: string;
  name: string;
  type:
    | "container" | "image" | "text" | "spine" | "prefab-instance"
    | "button" | "scroll-view" | "input" | "slider" | "progress-bar"
    | "horizontal-layout" | "vertical-layout" | "grid-layout";
  parentId: string | null;
  children: string[];
  visible: boolean;
  transform: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
  };
  layout?: LayoutDefinition;
  binding?: string;
  metadata?: Record<string, unknown>;
};
```

### 6.2. Layout v0

Scene хранит общие presentation-свойства и overrides для двух обязательных профилей:

```ts
type LayoutProfileId = "desktop" | "mobile";

type ProfiledLayout<T> = {
  base: T;
  overrides?: Partial<Record<LayoutProfileId, Partial<T>>>;
};

type SceneLayoutSettings = {
  referenceViewports: Record<LayoutProfileId, {
    width: number;
    height: number;
  }>;
  profileSelection: {
    mode: "aspect-ratio";
    mobileMaxAspectRatio: number;
  };
};
```

Конкретная форма schema может измениться после spike, но должны сохраняться свойства:

- общая hierarchy не дублируется;
- stable node IDs одинаковы в обоих профилях;
- override хранит только отличия от base;
- runtime и editor используют один resolver профиля;
- export содержит оба профиля;
- validator проверяет оба профиля.

Не следует начинать с универсального constraint solver. Для MVP достаточно:

- absolute position относительно parent;
- horizontal anchor: `left | center | right | stretch`;
- vertical anchor: `top | center | bottom | stretch`;
- offsets;
- percentage width и height;
- min/max width и height;
- flow container: `row | column`, `gap`, `padding`, `align`, `justify`;
- contain/cover для image node;
- safe-area reference для root-level элементов.

### 6.3. Prefab v0

Prefab хранит собственную hierarchy и список exposed properties. Instance хранит ссылку на prefab и overrides.

В первой версии не нужно позволять override любого внутреннего поля. Достаточно явно exposed properties.

---

## 7. Этапы реализации

Этапы ниже описывают порядок, а не жесткий календарный план. Каждый этап должен завершаться демонстрируемым результатом.

### Этап 0. Технический foundation

**Цель:** зафиксировать основу, на которой editor и runtime не разойдутся.

Результат:

- monorepo;
- package `schema`;
- stable ID strategy;
- JSON Schema validation;
- sample document в репозитории;
- минимальная migration infrastructure;
- CI с typecheck, tests и build;
- ADR по границам editor/runtime/backend.

Критерий выхода: sample document проходит validation и может быть загружен тестовым кодом.

### Этап 1. Runtime vertical slice

**Цель:** отобразить декларативный документ вне редактора.

Результат:

- загрузка manifest и scene JSON;
- asset resolver для изображений;
- node factory через общий `NodeView` для всех schema v3 node types;
- базовые transforms;
- индекс render nodes по stable ID и generic binding;
- runtime-demo с binding/stable-ID lookup, input и связью slider → progress bar;
- deterministic scene loading.

Критерий выхода: изменение JSON меняет UI в runtime-demo без изменения игрового кода.

### Этап 2. Минимальный редактор сцены

**Цель:** отказаться от ручного редактирования JSON.

Результат:

- editor shell;
- создание/открытие проекта;
- создание сцены;
- hierarchy panel;
- добавление базовых nodes;
- selection на canvas и в hierarchy;
- move, resize, rotate;
- inspector transform и основных свойств;
- reorder и reparent;
- локальное сохранение и autosave;
- базовый undo/redo для операций с nodes.

Критерий выхода: пользователь собирает простой экран с изображением и текстом, перезагружает страницу и продолжает работу.

### Этап 3. Assets, Spine и responsive preview

**Цель:** доказать реальный authoring flow с готовыми игровыми ассетами.

Результат:

- Asset Library;
- upload изображений;
- `Select another asset`;
- `Replace asset source` с сохранением asset ID;
- usage tracking перед удалением;
- загрузка Spine skeleton, atlas и textures;
- Spine node и preview animation;
- отдельные reference viewport для `desktop` и `mobile`;
- общая hierarchy с profile overrides;
- переключатель active layout profile;
- детерминированный runtime profile resolver;
- anchors v0;
- простой flow container;
- viewport presets внутри каждого профиля;
- safe area overlay;
- validation обоих профилей перед публикацией;
- runtime resize в editor и runtime-demo.

Критерий выхода: один экран имеет общую hierarchy и два обязательных layout-профиля — `desktop` и `mobile`; оба корректно отображаются в своих viewport presets без копирования сцены, node IDs или prefab instances.

### Этап 4. Prefabs и generic runtime integration

**Цель:** проверить переиспользование и связь с игровым кодом.

Результат:

- создание prefab из hierarchy;
- prefab edit mode;
- создание instances;
- exposed properties;
- local overrides и reset override;
- обновление instances после изменения definition;
- базовая проверка циклических зависимостей;
- binding editor для user-defined aliases;
- lookup API по stable ID и binding;
- validation duplicate bindings и missing references;
- prefab content slots только при подтвержденной необходимости и без отдельного runtime registry.

Критерий выхода: изменение prefab button обновляет два instance, сохраняя разные label и asset overrides.

### Этап 5. Backend, публикация и экспорт

**Цель:** завершить пользовательский pipeline.

Результат:

- API проектов;
- загрузка ассетов в object storage;
- server-side autosave или сохранение snapshot;
- draft revision number;
- publish immutable snapshot;
- список published versions;
- восстановление опубликованной версии в новый draft;
- export manifest, scenes, prefabs и assets;
- ZIP download;
- runtime-demo умеет загружать опубликованный package;
- минимальный changelog публикации.

Критерий выхода: опубликованный package можно скачать и воспроизвести независимо от текущего draft.

### Этап 6. Стабилизация MVP и пилот

**Цель:** проверить продукт не на разработчиках платформы, а на реальном пользователе.

Результат:

- validation panel с error/warning;
- обработка broken references;
- loading и error states;
- crash-safe autosave;
- базовые keyboard shortcuts;
- copy/paste и duplicate;
- smoke tests экспорта;
- golden tests: editor preview против runtime-demo;
- один пилотный экран из реального проекта;
- фиксация проблем UX и schema.

Критерий выхода: дизайнер или technical artist самостоятельно проходит весь сценарий по инструкции, а frontend-разработчик подключает package без ручного воссоздания layout.

---

## 8. MVP backlog

Задачи намеренно сформулированы крупными блоками. Их можно дробить после проверки архитектурных рисков и назначения исполнителей.

### 8.1. Foundation и schema

| ID | Задача | Приоритет | Результат |
|---|---|---:|---|
| CORE-01 | Поднять TypeScript monorepo для editor, runtime, API и shared packages | P0 | Все части собираются и используют общие типы |
| CORE-02 | Описать `ProjectDocument` и JSON Schema v0 | P0 | Валидируемый декларативный формат проекта |
| CORE-03 | Реализовать stable ID и reference helpers | P0 | Ссылки не зависят от names и hierarchy paths |
| CORE-04 | Добавить schema migrations framework и первую no-op migration | P1 | Формат готов к дальнейшему изменению |
| CORE-05 | Подготовить эталонный sample project и fixtures | P0 | Общая база для editor/runtime/tests |

### 8.2. PixiJS runtime

| ID | Задача | Приоритет | Результат |
|---|---|---:|---|
| RT-01 | Реализовать package и scene loader | P0 | Runtime загружает manifest и scene document |
| RT-02 | Реализовать node factory для Container, Image и Text | P0 | Базовая scene hierarchy отображается в PixiJS |
| RT-03 | Реализовать asset resolver и lifecycle ресурсов | P0 | Изображения загружаются и освобождаются предсказуемо |
| RT-04 | Реализовать transforms и layout v0 | P0 | Scene реагирует на изменение viewport |
| RT-05 | Реализовать NodeIndex и BindingIndex | P0 | Код получает UI-узлы по stable ID или user-defined alias без встроенной игровой семантики |
| RT-06 | Добавить Spine adapter и animation playback | P0 | Spine одинаково работает в editor и demo runtime |
| RT-07 | Создать runtime-demo для проверки опубликованных packages | P0 | Есть независимый consumer UI package |

### 8.3. Editor shell и scene authoring

| ID | Задача | Приоритет | Результат |
|---|---|---:|---|
| ED-01 | Собрать базовый layout веб-редактора | P0 | Toolbar, hierarchy, canvas, inspector, bottom panel |
| ED-02 | Реализовать создание проекта и сцен | P0 | Пользователь может начать новый document |
| ED-03 | Реализовать scene tree и hierarchy operations | P0 | Add, delete, reorder, reparent nodes |
| ED-04 | Встроить production runtime в editor canvas | P0 | Preview не имеет отдельного renderer |
| ED-05 | Реализовать selection, move, resize и rotate overlays | P0 | Базовое визуальное редактирование сцены |
| ED-06 | Реализовать inspector для node properties | P0 | Свойства изменяются без редактирования JSON |
| ED-07 | Добавить copy/paste, duplicate и basic keyboard shortcuts | P1 | Редактор пригоден для повседневной сборки |
| ED-08 | Реализовать command history для core operations | P0 | Undo/redo основных изменений |

### 8.4. Assets и Spine

| ID | Задача | Приоритет | Результат |
|---|---|---:|---|
| ASSET-01 | Реализовать Asset Library и upload изображений | P0 | Ассеты доступны для назначения nodes |
| ASSET-02 | Разделить операции выбора другого asset и замены source | P0 | Локальная и глобальная замена не смешиваются |
| ASSET-03 | Добавить usage index и защиту удаления используемого asset | P0 | Нельзя незаметно сломать проект |
| ASSET-04 | Реализовать import Spine package и чтение metadata | P0 | Доступны animations, skins и version metadata |
| ASSET-05 | Добавить Spine preview controls в inspector | P1 | Можно выбрать animation, loop и time scale |

### 8.5. Responsive layout

| ID | Задача | Приоритет | Результат |
|---|---|---:|---|
| LAYOUT-01 | Реализовать два обязательных layout-профиля `desktop` и `mobile` | P0 | Каждая сцена хранит общую hierarchy и profile-specific overrides |
| LAYOUT-02 | Реализовать reference viewport и runtime resize для каждого профиля | P0 | Каждый профиль считается относительно своего reference viewport |
| LAYOUT-03 | Реализовать единый profile resolver для editor и runtime | P0 | Один viewport всегда детерминированно выбирает одинаковый профиль |
| LAYOUT-04 | Реализовать anchor constraints v0 | P0 | Элементы привязываются к краям и центру parent |
| LAYOUT-05 | Реализовать percentage и min/max sizing | P0 | Поддерживаются базовые адаптивные размеры внутри профиля |
| LAYOUT-06 | Реализовать flow container row/column | P0 | Панели и группы кнопок можно собирать без ручных координат |
| LAYOUT-07 | Добавить profile switcher, viewport presets и safe area preview | P0 | Дизайнер явно проверяет desktop и mobile варианты |
| LAYOUT-08 | Валидировать overflow и layout errors в обоих профилях | P0 | Publish не пропускает сломанный desktop или mobile вариант |

### 8.6. Prefabs и generic integration

| ID | Задача | Приоритет | Результат |
|---|---|---:|---|
| PREFAB-01 | Реализовать prefab definition и создание prefab из nodes | P0 | Повторно используемая hierarchy хранится отдельно |
| PREFAB-02 | Реализовать prefab instance resolution в runtime | P0 | Instances отображаются без копирования definition |
| PREFAB-03 | Добавить exposed properties и instance overrides | P0 | Instance меняет разрешенные свойства |
| PREFAB-04 | Реализовать update propagation и reset override | P0 | Изменения definition доходят до instances |
| PREFAB-05 | Добавить detach instance и простой nested prefab guard | P1 | Есть escape hatch и защита от циклов |
| CONTRACT-01 | Реализовать user-defined bindings и node lookup в schema/editor/runtime | P0 | Интеграция использует stable ID или непрозрачный alias без жанровых сущностей в core |
| CONTRACT-02 | Добавить validation duplicate bindings и broken references | P0 | Ошибки integration ловятся до export |
| PREFAB-06 | Исследовать prefab content slots на одном реальном composition-кейсе | P1 | Решение о slots принимается по потребности prefab authoring, а не как заранее заданный runtime API |

### 8.7. Persistence, backend и publish

| ID | Задача | Приоритет | Результат |
|---|---|---:|---|
| BE-01 | Реализовать минимальный Projects API | P0 | Create, open, save project |
| BE-02 | Настроить object storage для asset sources | P0 | Исходные файлы не хранятся внутри document JSON |
| BE-03 | Реализовать autosave draft snapshot | P0 | Перезагрузка не приводит к потере работы |
| BE-04 | Реализовать publish immutable version | P0 | Разработчик работает со стабильной ревизией |
| BE-05 | Добавить список версий и restore snapshot to draft | P1 | Возможен простой rollback |
| EXPORT-01 | Реализовать package assembler и manifest | P0 | Документ и assets собираются в воспроизводимый package |
| EXPORT-02 | Реализовать ZIP export и download | P0 | Package можно передать в игру без API integration |

### 8.8. Validation, testing и pilot

| ID | Задача | Приоритет | Результат |
|---|---|---:|---|
| QA-01 | Реализовать headless project validator | P0 | Проверки можно запускать в editor, backend и tests |
| QA-02 | Добавить validation panel с error/warning | P0 | Пользователь понимает, что мешает публикации |
| QA-03 | Добавить golden fixtures для одинакового layout в editor и demo | P0 | Снижается риск расхождения preview и game |
| QA-04 | Добавить smoke test publish → ZIP → runtime load | P0 | Проверяется основной продуктовый pipeline |
| QA-05 | Собрать один реальный пилотный экран | P0 | Архитектура проверяется на неигрушечном кейсе |
| QA-06 | Провести usability session с дизайнером и зафиксировать blockers | P0 | Backlog следующей итерации основан на реальном использовании |

---

## 9. Рекомендуемый cut line

### Demo vertical slice

Минимальный набор для первой демонстрации:

- `CORE-01..03`, `CORE-05`;
- `RT-01..05`, `RT-07`;
- `ED-01..06`;
- `ASSET-01..02`;
- `LAYOUT-01..04`, `LAYOUT-07..08`;
- локальное сохранение проекта;
- один generic binding и lookup второго узла по stable ID;
- ручная сборка package script.

Этот slice уже должен показать:

```text
Editor document → shared runtime → runtime-demo
```

### MVP beta

К demo vertical slice добавляются:

- Spine, font-assets и styled text;
- prefab instances и overrides;
- horizontal/vertical/grid layout groups и scroll view;
- backend persistence;
- publish snapshots;
- ZIP export;
- validation panel;
- pilot project.

---

## 10. Ключевые архитектурные решения, которые нужно принять в начале

Необходимо зафиксировать короткими ADR:

1. **Где находится canonical document:** normalized store или tree JSON.
2. **Как разрешаются prefab instances:** при загрузке, при export или лениво в runtime.
3. **Как хранится asset version:** immutable file version или mutable source pointer внутри stable asset record.
4. **Как editor commands изменяют document:** direct mutation, reducer или command transactions.
5. **Как считается layout:** собственный ограниченный solver или адаптация существующей layout-модели.
6. **Как хранятся и наследуются `desktop`/`mobile` overrides и какое aspect-ratio правило выбирает профиль.**
7. **Какие PixiJS и Spine версии считаются поддерживаемыми runtime target.**
8. **Как определяется deterministic serialization:** порядок массивов, округление чисел и stable property order.
9. **Какие ошибки блокируют publish.**

Для прототипа решения должны быть простыми и обратимыми. Не следует проектировать plugin API или multi-engine abstraction до подтверждения основного workflow.

---

## 11. Основные риски и способы быстро их проверить

| Риск | Быстрая проверка | Решение при проблеме |
|---|---|---|
| Editor preview расходится с game | Один fixture загружается editor и runtime-demo, результаты сравниваются | Удалить editor-specific rendering logic |
| Layout model слишком сложная для дизайнера | Дать дизайнеру собрать один реальный экран в обязательных `desktop` и `mobile` профилях | Оставить shared hierarchy, сократить overrides и набор правил |
| Desktop/mobile начинают расходиться как две независимые сцены | Изменить общий prefab и проверить оба профиля | Запретить дублирование hierarchy; хранить только profile overrides |
| Runtime выбирает другой профиль, чем editor | Golden test на viewport около breakpoint | Использовать один shared profile resolver |
| Prefab overrides становятся непредсказуемыми | Button prefab с двумя instances и несколькими overrides | Разрешать override только exposed properties |
| Spine нестабилен в browser/runtime | Ранний spike на реальном asset | Зафиксировать одну версию и format policy |
| Документ сложно мигрировать | Изменить одно поле schema и прогнать fixture migration | Упростить model и добавить versioned migrations |
| Asset replacement ломает проект | Заменить source у asset с несколькими usages | Разделить stable asset record и immutable file version |
| Редактор неудобен без сложного UX | Короткая usability session после Этапа 2 | Исправлять базовые операции до расширения scope |
| Backend замедляет прототип | Сначала local persistence и mock package storage | Подключать cloud после стабилизации schema |

---

## 12. Definition of Done для MVP

MVP считается готовым к внутреннему пилоту, когда выполнены все условия:

- пользователь создает проект и минимум две сцены;
- в сцене используются Image, styled Text, Spine, PrefabInstance, layout groups и generic UI controls;
- ассет можно заменить глобально без изменения node IDs;
- prefab definition обновляет минимум два instances, сохраняя overrides;
- каждая сцена содержит оба обязательных layout-профиля: `desktop` и `mobile`;
- hierarchy, stable IDs, assets, bindings и prefab instances общие для обоих профилей;
- desktop и mobile могут иметь отдельные transform/layout/visibility overrides;
- каждый профиль проверен минимум на двух viewport presets своего диапазона;
- editor и runtime выбирают профиль одним и тем же resolver;
- publish блокируется при критической layout-ошибке в любом профиле;
- editor preview и runtime-demo используют один runtime package;
- UI-узел находится кодом по generic binding;
- другой UI-контейнер находится по stable ID и может использоваться как host без специальной slot-сущности;
- validation блокирует publish при missing asset или duplicate binding;
- publish создает immutable version;
- ZIP содержит manifest, scenes, prefabs и assets;
- runtime-demo загружает ZIP/package и воспроизводит опубликованную сцену;
- изменение draft не меняет уже опубликованную версию;
- пилотный пользователь проходит workflow без ручного редактирования JSON.

---

## 13. Что делать сразу после MVP

Следующую итерацию следует выбирать по итогам пилота, а не по полноте исходной концепции. Наиболее вероятные направления:

1. улучшение editor reliability и UX;
2. расширение layout model;
3. TypeScript bindings generation;
4. более строгая asset и Spine validation;
5. полноценная revision history и visual diff;
6. templates и reusable component libraries;
7. collaboration и permissions — только если single-editor workflow уже работает.

---

## 14. Учет репозитория `sw1f1s/pixi-ui-editor`

Репозиторий следует использовать как reference implementation и источник отдельных модулей, но не как готовую основу без ревизии scope и runtime parity.

Короткие правила для реализации прототипа:

- сохранить разделение `core` / `runtime` / `exporter` / `editor` и contract tests;
- сохранить stable IDs, command bus, render-tree abstraction и headless plain adapter для тестов;
- не переносить MCP, themes, style libraries, localization, controls library и interaction graph в MVP;
- не создавать отдельный runtime `SlotRegistry`: в текущем коде репозитория его нет, а generic node index уже покрывает базовый lookup;
- editor preview обязан использовать настоящий Pixi adapter; Canvas 2D renderer может оставаться только временным UX spike;
- не использовать plain adapter как неявный production fallback: editor и game должны явно передавать PixiJS adapter;
- snapshot-based undo допустим на первом прототипе, но drag/resize должны объединяться в одну history transaction;
- exporter из репозитория считать manifest builder, а не готовым package pipeline: нужны реальные asset files, deterministic paths и ZIP;
- asset model нужно дополнить source versioning, replace-source semantics и полноценным Spine asset;
- component/prefab slots рассматривать только как generic composition feature внутри prefab system;
- перед выбором component-first model провести короткий spike: нельзя одновременно поддерживать две конкурирующие canonical модели — rigid leaf node types и произвольный component stack;
- materialized IDs вложенных prefab instances должны быть детерминированными и не конфликтовать между instances;
- schema должна содержать только реально поддержанные свойства; placeholder-поля будущих фаз не включаются в v0.

Подробный разбор и таблица решений вынесены в отдельный документ `pixi-ui-editor-repository-review.md`.

---

## 15. Учет zStudio

zStudio следует использовать как главный продуктовый и UX-reference для визуальной сборки PixiJS UI. Он подтверждает жизнеспособность нужного workflow: artists собирают responsive scene, используют templates и Spine, экспортируют JSON, а приложение загружает результат через importer.

Что важно перенять:

- обязательную работу сразу с различающимися aspect-ratio режимами;
- быстрый visual authoring и явное переключение layout profile;
- anchors и responsive preview без ручного layout-кода в игре;
- templates/instances как центральный reuse workflow;
- drag-and-drop asset import, Spine preview и live test mode;
- простой importer API для загрузки сцены в PixiJS;
- production preview, максимально близкий к runtime result.

Что не нужно копировать напрямую:

- lookup и контракты, основанные на display names;
- специальные имена дочерних узлов как скрытый runtime protocol;
- сильную связанность document format с классами готовых controls;
- необходимость менять transforms только через методы runtime wrapper, чтобы сохранить orientation state;
- frame-based timeline в MVP;
- смешивание layout authoring tool и готового UI behavior framework;
- дублирование полной hierarchy между desktop и mobile.

Наша целевая адаптация идей zStudio:

```text
zStudio-like visual workflow
        +
stable IDs and explicit asset identity
        +
shared scene hierarchy
        +
desktop/mobile profile overrides
        +
versioned publish package
        +
web-first project workflow
```

Подробное ревью, таблица преимуществ/ограничений и implementation checklist находятся в `zstudio-review-for-game-ui-platform.md`.

---

## 16. Итоговый порядок приоритетов

```text
1. Schema + shared runtime
2. Runtime-demo
3. Basic scene editor
4. Mandatory desktop/mobile profiles + responsive preview
5. Assets + Spine
6. Prefabs + generic bindings
7. Publish + ZIP export
8. Validation обоих профилей + pilot
9. Только затем collaboration и расширенные возможности
```

Главная защита от расползания scope: любое новое требование должно отвечать на вопрос — **нужно ли оно, чтобы дизайнер собрал UI, опубликовал package, а PixiJS runtime воспроизвел его без ручной пересборки?**
