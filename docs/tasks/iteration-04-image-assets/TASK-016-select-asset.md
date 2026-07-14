# TASK-016 — выбор asset у image node

## Зависимость

TASK-015 завершена. Сначала выполните её проверки, включая визуальную.

## Цель

У выбранного image node в Inspector появляется секция **Image** с выпадающим списком ассетов документа («Select another asset» из плана MVP). Выбор другого asset немедленно меняет текстуру node на canvas в обеих ориентациях.

## Зафиксированные решения

- В store добавляется одна операция (через `commitCandidate`):

```ts
setImageNodeAsset(nodeId: string, assetId: string): void;
```

  Операция меняет `node.assetId` только у node с `type === "image"`; для другого типа — `console.warn` и выход без изменений. Ссылку на несуществующий или не-image asset отбрасывает validation (`MISSING_ASSET_REFERENCE` / `INCOMPATIBLE_ASSET_REFERENCE`) — отдельных проверок в операции не нужно.
- UI: секция `Image` в `Inspector.tsx`, показывается только для node типа image, размещается над секцией Orientation. Внутри — `<select>` со всеми ассетами документа типа image (значение — `asset.id`, подпись — `asset.name`), текущий `node.assetId` выбран. Inspector-у понадобится доступ к `document.assets` — берите из store тем же способом, что остальные данные.
- Кнопка `+ Image` продолжает создавать node с первым image asset документа — её не трогаем.
- Смена asset — это изменение документа, сцена пересобирается существующим механизмом; ничего специально перерисовывать не нужно.

## Что создать

- Операцию `setImageNodeAsset` в `store.ts`.
- Секцию Image в `Inspector.tsx`.

В тесты store добавьте один unit-тест: `setImageNodeAsset` с id существующего image asset меняет `assetId` node «Logo»; с несуществующим id (`createStableId()`) — отбрасывается и документ не меняется.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

Перед проверкой загрузите через Upload одну свою картинку (из TASK-015).

1. Выберите Logo → в Inspector есть секция Image, в select выбран «Sample Logo».
2. Выберите в select загруженный asset → Logo на canvas немедленно показывает новую картинку.
3. Переключитесь в Vertical → Logo и там показывает новую картинку на своей mobile-позиции.
4. Выберите text node Greeting → секции Image в Inspector нет.
5. Перезагрузите страницу → выбор asset сохранился (localStorage).

## Критерии приёмки

- Все изменения идут через `setImageNodeAsset` с `commitCandidate`; невалидная ссылка не попадает в store (подтверждено тестом).
- Секция Image показывается только для image nodes.
- Пять шагов визуальной проверки воспроизводятся.
- Обязательные команды зелёные.

## Отчёт исполнителя

Опишите сигнатуру операции, устройство секции Image, результаты визуальной проверки по шагам и результаты команд.
