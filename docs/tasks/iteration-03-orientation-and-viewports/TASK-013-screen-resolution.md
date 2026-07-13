# TASK-013 — Screen resolution в toolbar, ADR 0003

## Зависимость

TASK-012 завершена. Сначала выполните её проверки, включая визуальную.

## Цель

В верхней панели появляется раздел **Screen** (аналог ScreenResolution в zStudio): пресеты Desktop / Tablet / Mobile и поля W/H. Они меняют размер reference viewport активной ориентации; артборд на canvas немедленно меняет размер, значения сохраняются в документе.

## Зафиксированные решения

- Редактируется `scene.layout.referenceViewports[activeProfile]` текущей сцены — существующее поле схемы; схема не меняется.
- В store добавляется одна операция (через `commitCandidate`; ширина/высота ≤ 0 или нечисловые значения отбрасываются validation-ом):

```ts
updateReferenceViewport(profile: LayoutProfileId, viewport: { width: number; height: number }): void;
```

- Пресеты — editor-only константа (в документ не сериализуется), размеры заданы для горизонтальной ориентации:

| Пресет  | W×H (horizontal) |
|---------|------------------|
| Desktop | 1920×1080        |
| Tablet  | 1280×800         |
| Mobile  | 844×390          |

  При активной вертикальной ориентации пресет применяется повёрнутым (H×W: Mobile → 390×844 и т.д.).
- UI раздела Screen: `<select>` с опциями Desktop/Tablet/Mobile/Custom + два number-поля W и H (используйте паттерн числового буфера из Inspector или простые input с применением по onChange валидных значений). Select показывает пресет, если текущий viewport совпадает с ним (с учётом поворота), иначе — Custom; опция Custom не применяет никаких размеров, выбирать её вручную нельзя (disabled).
- Раздел управляет **активной** ориентацией: переключили ориентацию — поля показывают viewport другого профиля.
- После изменения размеров камера заново выполняет Fit.
- ADR `docs/adr/0003-orientation-as-layout-profiles.md` фиксирует уже реализованные в итерации решения: ориентации UI = существующие layout-профили (horizontal↔desktop, vertical↔mobile); активная ориентация — editor-state; правки transform в vertical пишут частичные `layoutOverrides.mobile`; per-orientation видимость = `layoutOverrides.*.visible`; reference viewports редактируемы, пресеты — editor-only. ADR не описывает нереализованное (tablet-профиль, responsive-правила).

## Что создать

- Операцию `updateReferenceViewport` в `store.ts`.
- Раздел Screen в toolbar (`App.tsx`): select пресетов + поля W/H.
- ADR 0003 по образцу существующих ADR в `docs/adr/`.
- Обновление секции «Текущее состояние проекта» в `agents.md`: итерация 03 завершена (одним-двумя пунктами, по образцу записей про итерации 01–02).

В тесты store добавьте один unit-тест: `updateReferenceViewport("mobile", { width: 500, height: 900 })` меняет viewport в документе; `{ width: 0, height: 900 }` отбрасывается и store не изменяется.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

1. В Horizontal select показывает Desktop (1920×1080 из sample). Выберите Tablet → артборд стал 1280×800, Fit сработал, nodes остались на своих координатах.
2. Введите в W значение 1600 → артборд расширился, select переключился на Custom.
3. Переключитесь в Vertical → поля показывают 390×844, select показывает Mobile (повёрнутый пресет 844×390).
4. В Vertical выберите Tablet → артборд стал 800×1280.
5. Перезагрузите страницу → размеры обеих ориентаций восстановились из localStorage; введите в H значение 0 → размер не применился, в console warning от validation.

## Критерии приёмки

- Все изменения размеров идут через `updateReferenceViewport`; невалидный viewport не попадает в store (подтверждено тестом).
- Пресеты не сериализуются в документ; в документе только `referenceViewports`.
- Пять шагов визуальной проверки воспроизводятся.
- ADR 0003 записан, `agents.md` обновлён.
- Обязательные команды зелёные.

## Отчёт исполнителя

Опишите сигнатуру операции, логику определения пресета в select, результаты визуальной проверки по шагам, ссылку на ADR и результаты команд.
