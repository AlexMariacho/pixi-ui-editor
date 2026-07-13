@echo off
setlocal

set "PROJECT_ROOT=%~dp0"
set "PROJECT_NODE=%PROJECT_ROOT%.tools\node22"
set "EDITOR_ROOT=%PROJECT_ROOT%apps\editor-web"

if not exist "%PROJECT_NODE%\node.exe" (
  echo Local Node.js 22 LTS was not found: %PROJECT_NODE%
  echo Restore the .tools\node22 folder or ask to install it again.
  exit /b 1
)

echo Using:
"%PROJECT_NODE%\node.exe" --version

if not exist "%EDITOR_ROOT%\node_modules\vite\bin\vite.js" (
  echo Editor dependencies were not found.
  echo Run "pnpm install --frozen-lockfile" once from the project root.
  exit /b 1
)

pushd "%EDITOR_ROOT%"
"%PROJECT_NODE%\node.exe" "node_modules\vite\bin\vite.js" --open
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
