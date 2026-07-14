# TASK-014 — реальные текстуры для image nodes

## Зависимость

Итерация 03 завершена. Перед началом выполните её обязательные проверки (`pnpm build`, `pnpm typecheck`, `pnpm test`) и убедитесь, что редактор открывается и переключает ориентации.

## Цель

Image nodes рендерятся реальными изображениями. Sample-проект получает настоящий файл `assets/sample-logo.png`, runtime-pixi умеет строить Sprite из заранее загруженных текстур, editor-web загружает текстуры и передаёт их в `buildSceneView`. Отсутствующая текстура по-прежнему рисуется серым плейсхолдером.

## Зафиксированные решения

- `buildSceneView` остаётся синхронным; четвёртым опциональным параметром принимает `textures?: ReadonlyMap<string, Texture>` (ключ — `assetId`). Если для image node есть текстура — создаётся `new Sprite(texture)`, и **после** резолва profile transform его размер выставляется `sprite.setSize(transform.width, transform.height)` (resolved-значения, не базовые). Если текстуры нет — текущий Graphics-плейсхолдер без изменений.
- В runtime-pixi добавляются экспорты:

```ts
export type AssetUrlResolver = (asset: Asset) => string | undefined;

/** HTMLImageElement + decode() + Texture.from; работает для data: URI и обычных URL. */
export async function loadTexture(url: string): Promise<Texture>;

/** Собирает текстуры для всех image nodes сцены. Ошибку загрузки одного asset логирует console.warn и пропускает. */
export async function loadSceneTextures(
  document: ProjectDocument,
  sceneId: string,
  resolveAssetUrl: AssetUrlResolver,
  cache?: Map<string, Texture>, // ключ — asset.source.uri
): Promise<Map<string, Texture>>; // ключ — asset.id
```

- Sample logo создаётся один раз PowerShell-скриптом (запускать из корня репозитория):

```powershell
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force examples/sample-project/assets | Out-Null
$bmp = New-Object System.Drawing.Bitmap 320, 160
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"
$g.Clear([System.Drawing.Color]::FromArgb(255, 76, 154, 255))
$font = New-Object System.Drawing.Font("Arial", 40, [System.Drawing.FontStyle]::Bold)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = "Center"; $fmt.LineAlignment = "Center"
$g.DrawString("LOGO", $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, 0, 320, 160)), $fmt)
$g.Dispose()
$bmp.Save("$PWD/examples/sample-project/assets/sample-logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
```

- editor-web резолвит URI так (новый модуль `apps/editor-web/src/assets.ts`):

```ts
import sampleLogoUrl from "../../../examples/sample-project/assets/sample-logo.png";

const SAMPLE_ASSET_URLS: Record<string, string> = { "assets/sample-logo.png": sampleLogoUrl };

export function resolveAssetUrl(asset: Asset): string | undefined {
  if (asset.source.uri.startsWith("data:")) return asset.source.uri;
  return SAMPLE_ASSET_URLS[asset.source.uri];
}
```

  Для import PNG может понадобиться декларация модуля — проверьте, что `vite-env.d.ts` содержит `/// <reference types="vite/client" />`.
- Кэш текстур — модульный `Map<string, Texture>` в `assets.ts` (ключ `asset.source.uri`), передаётся в `loadSceneTextures`.
- В `SceneCanvas` effect пересборки сцены становится асинхронным по шагу загрузки: сначала `await loadSceneTextures(...)`, затем существующая синхронная пересборка с передачей `textures`. Обязателен guard `cancelled` (по образцу init-effect): если effect уже отменён к моменту готовности текстур, пересборка не выполняется. До готовности текстур предыдущая сцена остаётся на экране.
- Drag, selection, pivot, rotation работают для Sprite так же, как раньше для Graphics: никакой логики, зависящей от типа view, не добавляется.

## Что создать

- `examples/sample-project/assets/sample-logo.png` (скриптом выше; закоммитить бинарный файл).
- `loadTexture`, `loadSceneTextures`, `AssetUrlResolver` и параметр `textures` в `packages/runtime-pixi/src/index.ts`.
- `apps/editor-web/src/assets.ts` с `resolveAssetUrl` и кэшем текстур.
- Загрузку текстур в effect пересборки сцены в `App.tsx`.

В `packages/runtime-pixi/src/index.test.ts` добавьте один тест: `buildSceneView` с картой `{ логотипId → Texture.WHITE }` создаёт для node «Logo» Sprite с шириной 320, а без карты — не Sprite (плейсхолдер остаётся). `loadTexture`/`loadSceneTextures` в headless-тестах не вызывайте.

## Обязательные проверки

```powershell
pnpm build
pnpm typecheck
pnpm test
```

Не забудьте пересобрать `packages/runtime-pixi` перед запуском editor-web: editor-web импортирует `dist/`, а не `src/`.

## Визуальная проверка

1. `Reset to sample`, Horizontal: node Logo показывает синюю картинку «LOGO» вместо серого прямоугольника; Greeting и Root не изменились.
2. Переключитесь в Vertical: Logo стоит по mobile-override и тоже показывает картинку.
3. Перетащите Logo мышью и поверните через Inspector — Sprite ведёт себя как раньше плейсхолдер (позиция, selection-рамка, pivot).
4. Кнопкой `+ Image` добавьте новый image node — он тоже рендерится картинкой логотипа.
5. Временно переименуйте ключ в `SAMPLE_ASSET_URLS` (эмуляция битого URI) → Logo рисуется серым плейсхолдером, рендер не падает; верните обратно.

## Критерии приёмки

- `buildSceneView` синхронен; текстуры передаются извне; отсутствие текстуры даёт плейсхолдер (подтверждено тестом).
- Sprite масштабируется по resolved profile transform (в вертикальной ориентации размеры берутся с учётом override).
- `packages/schema` не изменён.
- Пять шагов визуальной проверки воспроизводятся.
- Обязательные команды зелёные.

## Отчёт исполнителя

Опишите сигнатуры новых функций runtime-pixi, как устроен async-шаг в effect пересборки (включая guard), результаты визуальной проверки по шагам и результаты команд.
