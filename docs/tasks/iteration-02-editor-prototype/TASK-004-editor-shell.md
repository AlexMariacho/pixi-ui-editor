# TASK-004 — editor shell на Vite + React с деревом sample project

## Зависимость

Итерация 01 завершена. Перед изменениями выполните `pnpm install --frozen-lockfile`, затем `pnpm build`, `pnpm typecheck`, `pnpm test` — всё должно быть зелёным.

## Цель

Превратить заглушку `apps/editor-web` в запускаемое браузерное приложение с каркасом редактора и деревом nodes загруженного sample project. PixiJS в этой задаче **не подключается**.

## Зафиксированные решения

- Vite ^7, React ^19, `@vitejs/plugin-react`; TypeScript уже есть в воркспейсе.
- Sample project импортируется как JSON-модуль: `import sampleJson from "../../../examples/sample-project/project.json"` и загружается через `loadProjectDocument` из `@pixi-ui-editor/runtime-pixi`. Никакого fetch и копирования файла.
- Состояние пока хранится обычным React state; zustand появится в TASK-006.
- Стили — один обычный CSS-файл, без CSS-фреймворков и CSS-in-JS.

## Что создать

В `apps/editor-web`:

1. `index.html`, `src/main.tsx`, `src/App.tsx` — стандартный Vite + React вход.
2. Каркас из четырёх зон (CSS grid на всю высоту окна):
   - toolbar сверху (высота ~40px): текст `Pixi UI Editor` и название проекта из документа;
   - левая панель (~260px): заголовок `Hierarchy`;
   - центр: заглушка с текстом `Canvas (появится в TASK-005)`;
   - правая панель (~280px): заголовок `Inspector`, текст `Выберите node`.
   Зоны должны быть визуально различимы (фон/границы).
3. Компонент `HierarchyTree`: рекурсивный список nodes сцены начиная с `rootNodeIds`. Для каждого node выводится `name` и в скобках `type`. Вложенность отражается отступом. Nodes ищутся по `id` в `scene.nodes` (постройте `Map<string, UINode>`; не полагайтесь на порядок массива).
4. Скрипты пакета: `dev` → `vite`, `build` → `tsc --noEmit -p tsconfig.json && vite build`, `typecheck` → `tsc --noEmit -p tsconfig.json`. Проверьте, что `tsconfig.json` включает `"jsx": "react-jsx"` и `resolveJsonModule`.
5. Если загрузка документа упала — покажите текст ошибки на странице красным, а не белый экран (`try/catch` вокруг загрузки).

Не добавляйте роутинг, тесты UI, state-менеджер, иконки и тёмные/светлые темы.

## Обязательные проверки

```powershell
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Визуальная проверка

```powershell
pnpm --filter @pixi-ui-editor/editor-web dev
```

Откройте адрес из вывода Vite. Должны быть видны: toolbar с названием проекта из sample (не хардкод), дерево слева — root container с дочерними image- и text-node (имена из JSON), заглушка в центре, inspector справа. Ошибок в console браузера нет.

## Критерии приёмки

- Название проекта и дерево берутся из загруженного `ProjectDocument`, а не захардкожены.
- Документ проходит через `loadProjectDocument` (migration + validation), а не через прямой cast JSON.
- Дерево строится по `rootNodeIds`/`children` через Map по `id`.
- `pnpm build` на корне воркспейса зелёный (editor-web собирается вместе со всеми).

## Отчёт исполнителя

Укажите команду запуска, что именно видно на странице (текстом), результаты обязательных команд и скриншот либо словесное описание визуальной проверки.
