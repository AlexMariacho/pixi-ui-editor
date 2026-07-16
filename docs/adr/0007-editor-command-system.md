# ADR 0007: Editor commands and replaceable key bindings

- Status: Accepted
- Date: 2026-07-16

## Decision

Global editor actions are represented by stable command IDs and implemented as commands in a single `EditorCommandRegistry`. A command owns its title, availability check, and execution. Toolbar buttons and keyboard shortcuts execute the same command, so UI entry points do not duplicate editor behavior.

Keyboard bindings are a separate `EditorKeyBindings` map from command IDs to one or more key combinations. The registry receives this map as configuration and can replace it at runtime. Default bindings preserve the current UX: Q / W / E select Pan / Select / Resize, M toggles Map, Escape leaves preset editing or Map, and Delete removes the selected editable node. Global commands are ignored while focus is in a text input or editable element.

Command state and key bindings are editor concerns and never enter `ProjectDocument`. Persisting user-defined bindings and exposing a shortcut-settings interface are deliberately deferred; that future UI will load and validate preferences, then supply the resulting map to the registry without changing commands or their callers.

Local keystrokes that only control a focused widget, such as Enter or Escape during inline rename, remain inside that widget and are not global editor commands.

## Consequences

Adding a global action requires one command definition and an optional default binding. Rebinding keys does not alter command implementations or React components, and button enabled states use the same command predicate as keyboard execution. Binding-conflict validation and preference persistence remain future work.
