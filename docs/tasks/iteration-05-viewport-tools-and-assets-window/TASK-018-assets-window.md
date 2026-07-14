# TASK-018 — плавающее окно Assets

## Зависимость

Итерация 04 завершена. Сначала выполните проверки TASK-017, включая визуальную.

## Цель

Раздел Assets переезжает из панели Hierarchy в отдельное плавающее окно поверх canvas. Окно открывается кнопкой в верхнем toolbar, перетаскивается за заголовок и закрывается крестиком. Весь существующий функционал (Upload, Replace, Delete с блокировкой по usage, превью) сохраняется без изменений.

## Зафиксированные решения

- UI-преференсы редактора — новый модуль `apps/editor-web/src/uiPrefs.ts` с отдельным zustand store `useUiPrefsStore` (по образцу `useEditorStore`):

```ts
export type UiPrefsState = {
  assetsWindowOpen: boolean;                 // default: false
  assetsWindowPosition: { x: number; y: number }; // default: { x: 16, y: 16 } — отступ от левого верхнего угла canvas-области
  setAssetsWindowOpen(open: boolean): void;
  setAssetsWindowPosition(position: { x: number; y: number }): void;
};
```

- Store сохраняется целиком (только data-поля) в localStorage под ключом `pixi-ui-editor:ui-prefs` через `subscribe`, по образцу персистентности документа в `store.ts`. Загрузка — функция `loadUiPrefs()`: битый JSON, отсутствующий ключ или неожиданная структура тихо откатываются к defaults (без `throw`). **UI-преференсы никогда не пишутся в project document.**
- В верхний toolbar (`App.tsx`, рядом со Screen Resolutions) добавляется кнопка-toggle `Assets`: открывает/закрывает окно, в открытом состоянии подсвечена (CSS-класс по образцу `screen-resolutions-trigger-open`).
- Окно — компонент `AssetsWindow` в `AssetPanel.tsx` (или отдельный файл `AssetsWindow.tsx` — на усмотрение исполнителя): `position: absolute` внутри `.canvas-panel`, поверх canvas и HUD. Внутри окна — существующий контент `AssetPanel` без функциональных изменений.
- Заголовок окна: текст `Assets`, кнопка `×` справа. Перетаскивание за заголовок: `pointerdown` на заголовке + `pointermove`/`pointerup` на `window`, позиция пишется в `setAssetsWindowPosition`. Кнопки внутри заголовка перетаскивание не запускают. Ограничивать позицию границами экрана не требуется.
- Из `hierarchy-panel` в `App.tsx` `<AssetPanel />` удаляется — Hierarchy снова содержит только дерево.
- Размеры окна: фиксированная ширина ~280px, максимальная высота ~60% высоты canvas-области, список внутри скроллится. Точная стилистика — на усмотрение исполнителя в духе существующих панелей.

## Что создать

- Модуль `uiPrefs.ts` (store + load/persist).
- Компонент окна Assets и кнопку в toolbar.
- Правки `App.tsx` и `styles.css`.

В тесты (`store.test.ts` или новый `uiPrefs.test.ts`) добавьте один unit-тест: `loadUiPrefs()` при битом JSON в localStorage возвращает defaults и не бросает исключение. Других новых тестов не нужно.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

1. Откройте редактор → в Hierarchy раздела Assets больше нет; окно Assets закрыто.
2. Нажмите кнопку Assets в toolbar → появилось плавающее окно со списком ассетов (Sample Logo с превью), кнопка подсвечена.
3. Перетащите окно за заголовок в другое место → окно движется за курсором.
4. Upload картинки, Replace и заблокированный Delete работают как в итерации 04.
5. Перезагрузите страницу → окно открыто на том же месте.
6. Закройте окно крестиком → окно исчезло, кнопка Assets не подсвечена.

## Критерии приёмки

- Assets полностью удалён из Hierarchy; функционал итерации 04 не деградировал.
- Преференсы окна хранятся в `pixi-ui-editor:ui-prefs` и не появляются в `pixi-ui-editor:document` (проверьте в DevTools → Application → Local Storage).
- Шесть шагов визуальной проверки воспроизводятся.
- Обязательные команды зелёные.

## Отчёт исполнителя

Опишите устройство `uiPrefs.ts`, устройство окна и перетаскивания, результаты визуальной проверки по шагам и результаты команд.
