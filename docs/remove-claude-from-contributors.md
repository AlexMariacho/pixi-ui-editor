# Как убрать Claude из Contributors на GitHub

## Почему Claude отображается как contributor

Claude указан в сообщениях некоторых коммитов через Git trailer:

```text
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

GitHub учитывает `Co-Authored-By` при построении списка contributors. Claude не
является основным автором коммитов этого репозитория, поэтому изменение
`user.name`, `user.email` или добавление `.mailmap` проблему не решит.

На момент подготовки этой инструкции:

- `main` содержит 2 коммита с Claude attribution;
- `develop` содержит 13 таких коммитов, включая общую с `main` историю;
- опубликованных тегов нет.

Проверить актуальное состояние можно так:

```powershell
git fetch --all --prune
git log origin/main --format="%h %s%n%b" |
  Select-String -Pattern "Co-Authored-By:\s*Claude" -CaseSensitive:$false
git log origin/develop --format="%h %s%n%b" |
  Select-String -Pattern "Co-Authored-By:\s*Claude" -CaseSensitive:$false
```

## Отключение attribution в новых коммитах

Добавьте в `.claude/settings.json`:

```json
{
  "attribution": {
    "commit": "",
    "pr": ""
  }
}
```

Настройка `attribution` актуальна для новых версий Claude Code. Старый параметр
`includeCoAuthoredBy: false` считается устаревшим.

После этого перед каждым push полезно проверять новые сообщения:

```powershell
git log origin/develop..HEAD --format="%h %s%n%b" |
  Select-String -Pattern "Co-Authored-By:\s*Claude" -CaseSensitive:$false
```

Настройка влияет только на будущие коммиты. Уже опубликованные trailer останутся
в истории и продолжат учитываться GitHub.

## Удаление Claude из существующей истории

### Важные последствия

Изменение сообщения коммита изменяет его SHA. Также изменяются SHA всех
последующих коммитов. Для публикации результата потребуется force-push.

Перед продолжением:

1. Убедитесь, что никто другой не работает поверх текущих `main` и `develop`.
2. Завершите или сохраните текущие локальные изменения. Не выполняйте rewrite в
   рабочем checkout редактора.
3. При наличии branch protection временно разрешите force-push владельцу
   репозитория.
4. Предупредите участников, что после операции им потребуется заново клонировать
   репозиторий либо вручную синхронизировать локальные ветки.

Для этого репозитория следует переписать `main` и `develop` вместе. Если очистить
только `main`, существующий `develop` продолжит ссылаться на старую историю.

### 1. Установить Python и `git-filter-repo`

В текущей Windows-среде проекта Python не установлен. Установите Python через
`winget`, затем откройте новый PowerShell:

```powershell
winget install --exact --id Python.Python.3.12
```

В новом PowerShell установите и проверьте `git-filter-repo`:

```powershell
py -3.12 -m pip install --user git-filter-repo
py -3.12 -m git_filter_repo --version
```

Дальше инструкция запускает инструмент как Python module, поэтому добавлять
каталог Python Scripts в `PATH` не требуется.

### 2. Создать отдельный mirror clone и резервную копию

Выполняйте команды вне текущего рабочего checkout:

```powershell
Set-Location D:\Projects
git clone --mirror git@github.com:AlexMariacho/pixi-ui-editor.git `
  pixi-ui-editor-history-rewrite.git
Set-Location .\pixi-ui-editor-history-rewrite.git

$oldMain = git rev-parse refs/heads/main
$oldDevelop = git rev-parse refs/heads/develop
$oldMainTree = git rev-parse "$oldMain`^{tree}"
$oldDevelopTree = git rev-parse "$oldDevelop`^{tree}"

@{
  OldMain = $oldMain
  OldDevelop = $oldDevelop
  OldMainTree = $oldMainTree
  OldDevelopTree = $oldDevelopTree
} | ConvertTo-Json | Set-Content .\rewrite-state.json

git bundle create ..\pixi-ui-editor-before-claude-removal.bundle --all
git bundle verify ..\pixi-ui-editor-before-claude-removal.bundle
```

Не удаляйте bundle, пока новая история не проверена и GitHub не показывает
ожидаемый результат.

### 3. Удалить только Claude/Anthropic co-author trailer

Команда ниже переписывает обе ветки и удаляет строки `Co-Authored-By`, только
если они ссылаются на `noreply@anthropic.com`. Другие соавторы сохраняются.

```powershell
py -3.12 -m git_filter_repo --force `
  --refs refs/heads/main refs/heads/develop `
  --commit-callback 'lines = commit.message.splitlines(); commit.message = b"\n".join(line for line in lines if not (line.lower().startswith(b"co-authored-by:") and b"noreply@anthropic.com" in line.lower())).rstrip() + b"\n"'
```

### 4. Проверить результат до push

В выводе первых двух команд не должно быть совпадений:

```powershell
$rewriteState = Get-Content .\rewrite-state.json | ConvertFrom-Json
$oldMain = $rewriteState.OldMain
$oldDevelop = $rewriteState.OldDevelop
$oldMainTree = $rewriteState.OldMainTree
$oldDevelopTree = $rewriteState.OldDevelopTree

git log main --format="%h %s%n%b" |
  Select-String -Pattern "Claude|noreply@anthropic.com" -CaseSensitive:$false
git log develop --format="%h %s%n%b" |
  Select-String -Pattern "Claude|noreply@anthropic.com" -CaseSensitive:$false

$newMainTree = git rev-parse "refs/heads/main^{tree}"
$newDevelopTree = git rev-parse "refs/heads/develop^{tree}"

if ($oldMainTree -ne $newMainTree) { throw "Содержимое main изменилось" }
if ($oldDevelopTree -ne $newDevelopTree) { throw "Содержимое develop изменилось" }

git fsck --full
```

Совпадение tree hash доказывает, что содержимое файлов в вершинах веток не
изменилось: были переписаны только метаданные истории.

### 5. Опубликовать переписанные ветки

`git-filter-repo` может удалить remote `origin` как защитную меру. Восстановите
его при необходимости:

```powershell
if (-not (git remote | Select-String -Pattern '^origin$')) {
  git remote add origin git@github.com:AlexMariacho/pixi-ui-editor.git
}
```

Перед push ещё раз убедитесь, что удалённые ветки не изменились после создания
mirror clone. `--force-with-lease` ниже использует сохранённые старые SHA и
откажется перезаписывать неожиданно обновившуюся ветку:

```powershell
git fetch origin main develop

git push `
  --force-with-lease="refs/heads/main:$oldMain" `
  origin refs/heads/main:refs/heads/main

git push `
  --force-with-lease="refs/heads/develop:$oldDevelop" `
  origin refs/heads/develop:refs/heads/develop
```

Не используйте `git push --mirror`: он может изменить или удалить другие refs,
не относящиеся к этой операции.

### 6. Проверить GitHub

1. Откройте страницу `Insights → Contributors` репозитория.
2. Проверьте историю обеих веток и отсутствие Claude в сообщениях новых
   коммитов.
3. Учтите, что статистика contributors на GitHub может обновиться не сразу.
4. После проверки верните прежние правила branch protection.

## Восстановление при ошибке

Остановитесь и не выполняйте дополнительные force-push. Резервный bundle
содержит исходные refs. Для просмотра доступных веток:

```powershell
git bundle list-heads ..\pixi-ui-editor-before-claude-removal.bundle
```

Исходную ветку можно восстановить в отдельный clone, проверить и только затем
вернуть на GitHub. Не восстанавливайте refs вслепую поверх удалённого
репозитория.

## Ссылки

- [GitHub: создание коммита с несколькими авторами](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/creating-a-commit-with-multiple-authors)
- [GitHub: изменение сообщений старых коммитов](https://docs.github.com/en/pull-requests/committing-changes-to-your-project/creating-and-editing-commits/changing-a-commit-message)
- [Claude Code: attribution settings](https://code.claude.com/docs/en/configuration#attribution-settings)
- [git-filter-repo](https://github.com/newren/git-filter-repo)
