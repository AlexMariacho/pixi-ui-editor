# Example Pixi App

Демо-приложение на чистом PixiJS (Vite + TypeScript, без React), которое воспроизводит экспортированный из редактора пакет через публичный API `@pixi-ui-editor/runtime-pixi`: выбирает layout-профиль по aspect ratio окна, рендерит выбранное окно с реальными текстурами, Spine-анимациями и раскрытыми пресетами.

## Как запустить

1. В редакторе (`pnpm --filter @pixi-ui-editor/editor-web dev`) нажмите **Export** — скачается `<projectName>.zip`.
2. Распакуйте zip в `examples/pixi-app/public/package/`, чтобы существовал файл `public/package/project.json` (директория в `.gitignore`, создайте её вручную).
3. Из корня репозитория:

   ```powershell
   pnpm install
   pnpm build   # собирает workspace-пакеты, из dist/ которых резолвятся типы
   pnpm --filter @pixi-ui-editor/example-pixi-app dev
   ```

4. Откройте URL из вывода Vite. Требуется Node.js 20.19+ или 22.12+ — Vite 7 dev-сервер не стартует на более старых версиях.

## Поведение

- По умолчанию рендерится первое окно проекта; другое окно выбирается query-параметром `?window=<имя или id>`.
- Канвас занимает весь экран; сцена масштабируется scale-to-fit по меньшей стороне reference viewport активного профиля и центрируется.
- Профиль (`desktop`/`mobile`) выбирается через `resolveProfileForViewport` по aspect ratio окна; при resize через breakpoint сцена перестраивается.
- Если `public/package/project.json` отсутствует, страница показывает подсказку по установке пакета.
