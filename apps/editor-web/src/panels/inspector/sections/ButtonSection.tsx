import { BUTTON_STATE_KEYS, type ButtonStateKey, type UINode } from "@pixi-ui-editor/schema";
import { listImageAssetOptions } from "../../../shared/assets.js";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow } from "../fields.js";

type ButtonNode = Extract<UINode, { type: "button" }>;

/** Пользовательское «Clicked» — это удержание pointer down; в schema/runtime оно называется pressed. */
export const BUTTON_STATE_LABELS: Record<ButtonStateKey, string> = {
  normal: "Normal",
  hover: "Hover",
  pressed: "Clicked (Pressed)",
  disabled: "Disabled",
};

export function ButtonSection({ node }: { node: ButtonNode }) {
  const assets = useEditorStore((state) => state.document.assets);
  const setButtonStateAsset = useEditorStore((state) => state.setButtonStateAsset);
  const setButtonEnabled = useEditorStore((state) => state.setButtonEnabled);
  const previewButtonState = useEditorStore((state) => state.previewButtonState);
  const buttonPreviewState = useEditorStore((state) => state.buttonPreviewStates[node.id] ?? "normal");
  const imageOptions = listImageAssetOptions(assets);

  return <InspectorWindow title="Button">
    {BUTTON_STATE_KEYS.map((state) => {
      const assetId = node.states[`${state}AssetId`];
      return <InspectorField key={state} label={BUTTON_STATE_LABELS[state]}>
        <select
          value={assetId ?? ""}
          onChange={(event) => setButtonStateAsset(node.id, state, event.target.value || undefined)}
        >
          {/* Normal обязателен; остальные состояния при пустом значении берут его изображение. */}
          {state !== "normal" && <option value="">(use Normal)</option>}
          {imageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </InspectorField>;
    })}
    <InspectorField label="Enabled"><input type="checkbox" checked={node.enabled} onChange={(event) => setButtonEnabled(node.id, event.target.checked)} /></InspectorField>
    {/* Transient: показывает состояние на canvas, но не сериализуется и не влияет на Preview. */}
    <InspectorField label="Preview state">
      <select value={buttonPreviewState} onChange={(event) => previewButtonState(node.id, event.target.value as ButtonStateKey)}>
        {BUTTON_STATE_KEYS.map((state) => <option key={state} value={state}>{BUTTON_STATE_LABELS[state]}</option>)}
      </select>
    </InspectorField>
  </InspectorWindow>;
}
