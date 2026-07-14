# TASK-015 — панель Assets и upload изображений

## Зависимость

TASK-014 завершена. Сначала выполните её проверки, включая визуальную.

## Цель

В левой панели редактора под Hierarchy появляется раздел **Assets**: список всех ассетов документа с превью и именем, кнопка **Upload** добавляет изображение с диска как новый asset. Загруженный asset сохраняется в документе (data URI) и переживает перезагрузку страницы.

## Зафиксированные решения

- В store добавляется одна операция (через `commitCandidate`):

```ts
addImageAsset(name: string, source: { uri: string; mediaType: string }): void;
```

  Она создаёт asset `{ id: createStableId(), name, type: "image", source }` и добавляет его в `document.assets`. Пустые `name`/`uri` отбрасываются validation-ом схемы.
- Upload: `<input type="file" accept="image/png,image/jpeg,image/webp">` (скрытый, открывается кнопкой Upload) → `FileReader.readAsDataURL` → `addImageAsset(имяФайлаБезРасширения, { uri: dataUri, mediaType: file.type })`.
- Файлы больше **2 МБ** не добавляются: `console.warn` + `alert` с объяснением (лимит localStorage). Файлы с `file.type` вне списка accept тоже отбрасываются с `console.warn`.
- UI раздела: компонент `AssetPanel` в новом файле `apps/editor-web/src/AssetPanel.tsx`, размещается в `hierarchy-panel` под деревом (заголовок `Assets`). Каждый элемент списка: превью `<img>` (src = `resolveAssetUrl(asset)`; если URL не резолвится — серый квадрат-заглушка через CSS), имя, тип. Стили — по образцу существующих панелей в `styles.css`, превью фиксированного размера (например 40×40, `object-fit: contain`).
- Никакого выбора asset, назначения на nodes, удаления и замены в этой задаче нет — только список и upload.

## Что создать

- Операцию `addImageAsset` в `store.ts`.
- `apps/editor-web/src/AssetPanel.tsx` и его подключение в `App.tsx` (левая панель).
- Стили списка ассетов в `styles.css`.

В тесты store (`store.test.ts`) добавьте один unit-тест: `addImageAsset("Uploaded", { uri: "data:image/png;base64,AAAA", mediaType: "image/png" })` добавляет asset в документ; вызов с `uri: ""` отбрасывается и документ не меняется.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

1. Откройте редактор: раздел Assets показывает «Sample Logo» с превью-картинкой логотипа и типом image.
2. Нажмите Upload и выберите любой PNG/JPEG с диска → asset появляется в списке с превью и именем файла.
3. Перезагрузите страницу → загруженный asset остался в списке (восстановлен из localStorage) и превью показывается.
4. Попробуйте загрузить файл больше 2 МБ → asset не добавился, показан alert, в console — warning.
5. `Reset to sample` → в списке снова только «Sample Logo».

## Критерии приёмки

- Все изменения документа идут через `addImageAsset` с `commitCandidate`; невалидный asset не попадает в store (подтверждено тестом).
- Data URI хранится в `asset.source.uri`; схема не изменена.
- Пять шагов визуальной проверки воспроизводятся.
- Обязательные команды зелёные.

## Отчёт исполнителя

Опишите сигнатуру операции, как устроен upload (включая лимит), результаты визуальной проверки по шагам и результаты команд.
