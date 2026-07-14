# TASK-017 — replace source, защита удаления, ADR 0004

## Зависимость

TASK-016 завершена. Сначала выполните её проверки, включая визуальную.

## Цель

Панель Assets получает у каждого asset действия **Replace** и **Delete**. Replace заменяет source-файл, сохраняя asset ID, — картинка обновляется во всех nodes, использующих asset (ASSET-02). Delete удаляет только неиспользуемый asset; используемый защищён (ASSET-03). Решения итерации фиксируются в ADR 0004.

## Зафиксированные решения

- В store добавляются две операции (через `commitCandidate`):

```ts
replaceAssetSource(assetId: string, source: { uri: string; mediaType: string }): void;
deleteAsset(assetId: string): void;
```

- `replaceAssetSource` сохраняет `id`, `name`, `type` asset-а и заменяет `source.uri`/`source.mediaType`; `source.version` устанавливается в ISO-строку момента замены (`new Date().toISOString()`).
- `deleteAsset` просто удаляет asset из `candidate.assets`. Если asset используется image/spine node-ами, validation отбросит кандидата по `MISSING_ASSET_REFERENCE` — дополнительной проверки в операции не нужно.
- Usage count считается в UI: количество nodes во всех `scenes` и `prefabs` документа, у которых `assetId === asset.id`. Кнопка Delete у asset с usage > 0 — `disabled` с `title` вида `Used by N node(s)`. Возле имени asset показывается счётчик использований.
- Replace использует тот же file input-механизм и те же ограничения, что Upload из TASK-015 (accept-типы, лимит 2 МБ, data URI через `FileReader`).
- Кэш текстур ключуется по `source.uri`, поэтому замена source автоматически приводит к загрузке новой текстуры при пересборке сцены; старая текстура не уничтожается (осознанное упрощение прототипа).
- ADR `docs/adr/0004-prototype-asset-storage.md` фиксирует уже реализованные в итерации решения: data URI как хранение загруженных ассетов в прототипе (без сервера, лимит 2 МБ); синхронный `buildSceneView` с внешней картой текстур и fallback-плейсхолдером; резолв URL через `AssetUrlResolver` (data: passthrough + карта sample-ассетов); раздельные операции select asset / replace source; защита удаления через document validation. ADR не описывает нереализованное (Spine, object storage, освобождение текстур).
- Обновление секции «Текущее состояние проекта» в `agents.md`: итерация 04 завершена (одним-двумя пунктами, по образцу записей про итерации 01–03).

## Что создать

- Операции `replaceAssetSource` и `deleteAsset` в `store.ts`.
- Кнопки Replace и Delete с usage count в `AssetPanel.tsx`.
- ADR 0004 по образцу существующих ADR в `docs/adr/`.
- Обновление `agents.md`.

В тесты store добавьте два unit-теста:

1. `replaceAssetSource` меняет `source.uri` у asset, сохраняя его `id`;
2. `deleteAsset` используемого asset отбрасывается (документ не меняется), а после удаления последнего использующего node тот же `deleteAsset` удаляет asset.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

Перед проверкой: `Reset to sample`, затем загрузите одну свою картинку через Upload.

1. У «Sample Logo» usage count ≥ 1, кнопка Delete задизейблена с подсказкой; у загруженного asset usage 0, Delete активна.
2. Нажмите Replace у «Sample Logo» и выберите другой файл → Logo на canvas (и все другие image nodes с этим asset) немедленно показывают новую картинку; превью в панели обновилось.
3. Переключитесь в Vertical → там тоже новая картинка.
4. Нажмите Delete у неиспользуемого загруженного asset → он исчез из списка; перезагрузите страницу — не вернулся.
5. Назначьте через Inspector какой-нибудь node загруженный asset, затем попробуйте его Delete → кнопка задизейблена; в качестве негативного теста вызовите `deleteAsset` в обход UI (временно включите кнопку или вызовите операцию из console через store) → документ не изменился, в console — warning от validation.

## Критерии приёмки

- Replace сохраняет asset ID (подтверждено тестом); select и replace остаются раздельными операциями.
- Используемый asset невозможно удалить ни через UI, ни через операцию store (подтверждено тестом).
- Пять шагов визуальной проверки воспроизводятся.
- ADR 0004 записан, `agents.md` обновлён.
- Обязательные команды зелёные.

## Отчёт исполнителя

Опишите сигнатуры операций, как считается usage count, результаты визуальной проверки по шагам, ссылку на ADR и результаты команд.
