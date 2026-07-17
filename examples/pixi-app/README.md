# Example Pixi App

Демо-приложение на чистом PixiJS (Vite + TypeScript, без React), которое воспроизводит пакет через публичный API `@pixi-ui-editor/runtime-pixi`: выбирает layout-профиль по aspect ratio окна, рендерит выбранное окно и подключает generic runtime-поведение по bindings с fallback на stable ID.

## Как запустить

1. Для быстрого запуска подготовьте игнорируемый package fixture из эталонного sample:

   ```powershell
   pnpm --filter @pixi-ui-editor/example-pixi-app prepare:sample
   ```

   Для проверки настоящего export pipeline вместо этого запустите редактор, нажмите **Export** и распакуйте скачанный zip в `examples/pixi-app/public/package/`.

2. Из корня репозитория:

   ```powershell
   pnpm install
   pnpm build   # собирает workspace-пакеты, из dist/ которых резолвятся типы
   pnpm --filter @pixi-ui-editor/example-pixi-app dev
   ```

3. Откройте URL из вывода Vite. Требуется Node.js 20.19+ или 22.12+ — Vite 7 dev-сервер не стартует на более старых версиях.

## Поведение

- По умолчанию рендерится первое окно проекта; другое окно выбирается query-параметром `?window=<имя или id>`.
- Канвас занимает весь экран; сцена масштабируется scale-to-fit по меньшей стороне reference viewport активного профиля и центрируется.
- Профиль (`desktop`/`mobile`) выбирается через `resolveProfileForViewport` по aspect ratio окна; при resize через breakpoint сцена перестраивается.
- `controls.reset`, `controls.playerName`, `controls.energy` и `display.energy` находятся по generic binding (с fallback на stable ID): input обновляет game-side имя, slider меняет progress, button сбрасывает оба значения.
- Live values хранятся в приложении, повторно применяются после смены layout-профиля и не записываются в `ProjectDocument`.
- Если `public/package/project.json` отсутствует, страница показывает подсказку по установке пакета.
