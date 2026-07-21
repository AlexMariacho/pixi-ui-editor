# ADR 0007: Editor commands and replaceable key bindings

- Status: Accepted
- Date: 2026-07-16

## Decision

Global editor actions are represented by stable command IDs and declared in a single `EditorCommandRegistry`. A command owns only its title, availability check and input bindings; the registry resolves an input or toolbar activation to a command ID and publishes it to subscribers. Toolbar buttons and keyboard shortcuts therefore execute the same semantic command, without duplicating editor behavior.

Command consumers subscribe to semantic IDs in a separate binding/service layer. For example, the editor binding layer subscribes viewport tools, Map, Cancel and Delete; the history service independently subscribes to `history.undo` and `history.redo`. The registry does not import, know about, or call store actions or feature services directly. Input sources know only a command ID, and a consumer knows only the command ID it handles, never a particular keyboard shortcut or button.

Keyboard bindings are a separate `EditorKeyBindings` map from command IDs to one or more key combinations. The registry receives this map as configuration and can replace it at runtime. Global editor shortcuts match physical `KeyboardEvent.code` values, not layout-dependent `KeyboardEvent.key` characters: Q / W / E and Ctrl+Z work identically under English and Russian keyboard layouts. Default bindings preserve the current UX: Q / W / E select Pan / Select / Resize, M toggles Map, Escape leaves preset editing or Map, and Delete removes the selected editable node. Global commands are ignored while focus is in a text input or editable element.

Command state and key bindings are editor concerns and never enter `ProjectDocument`. Persisting user-defined bindings and exposing a shortcut-settings interface are deliberately deferred; that future UI will load and validate preferences, then supply the resulting map to the registry without changing commands or their callers.

Local keystrokes that only control a focused widget, such as Enter or Escape during inline rename, remain inside that widget and are not global editor commands.

## Dependency rules

Module dependencies must always form a directed acyclic graph. Cyclic imports are prohibited, including apparently harmless cycles that only cross a registry, binding module and feature service. Shared contracts must point downward: if a service needs to subscribe, it receives a minimal subscription interface or a stable command ID rather than importing the registry implementation back into its own module. A new command integration that introduces a cycle must be refactored before it is merged.

## Consequences

Adding a global action requires one command definition, an optional default binding and an explicit subscriber in the owning service or binding layer. Rebinding keys does not alter command consumers or React components, and button enabled states use the same command predicate as keyboard execution. Binding-conflict validation and preference persistence remain future work.
