# Pixi UI Editor — инструкции для агентов

## Контекст проекта

Pixi UI Editor — web-first редактор для сборки игрового UI на PixiJS. Редактор владеет только presentation-структурой, а игровое приложение — поведением и gameplay-логикой.

Перед началом архитектурной или продуктовой работы прочитайте документы в [`docs/`](docs/):

- `game-ui-authoring-platform-concept.md` — целевая продуктовая и архитектурная концепция;
- `game-ui-platform-implementation-plan-mvp-v3.md` — границы MVP, порядок реализации и backlog;
- `zstudio-review-for-game-ui-platform.md` — полезные паттерны и анти-паттерны из zStudio.

## Базовые архитектурные правила

- Документ UI декларативен: не сериализируйте внутренние объекты PixiJS.
- Системная идентичность сущностей строится на неизменяемых stable ID; имена, пути и индексы не являются идентичностью.
- Node и Asset — отдельные сущности. Замена файла ассета не должна неявно ломать ссылки.
- В сцене одна общая hierarchy. `desktop` и `mobile` реализуются как layout-профили с overrides, а не как копии сцен.
- Editor preview и игра должны использовать один production runtime и одинаковый profile resolver.
- Runtime API остаётся generic и не содержит жанровую или игровую семантику. Игровой код подключается через bindings/slots.
- Публикация создаёт версионированный неизменяемый package; draft не является контрактом для игры.

## MVP-приоритеты

Сначала развивайте сквозной сценарий: создание сцены → ассеты (включая Spine) → desktop/mobile layout → prefab → bindings → publish/export → загрузка в PixiJS runtime. Не расширяйте MVP timeline-редактором, behavior graph, готовой библиотекой игровых controls или дополнительными runtime targets без отдельного решения.

## Изменения

- Сохраняйте schema versioning и миграции с первой версии формата.
- Добавляйте validation для ссылок, prefabs, bindings и обоих layout-профилей.
- При изменениях документа, layout resolver или runtime добавляйте тесты, покрывающие desktop и mobile, включая viewport около breakpoint.
- Обновляйте документы в `docs/`, если меняются зафиксированные архитектурные решения или границы MVP.
