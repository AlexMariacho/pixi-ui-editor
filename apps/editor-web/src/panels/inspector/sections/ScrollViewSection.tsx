import type { ScrollViewNode, ScrollViewSettings } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow, NumberField } from "../fields.js";

export function ScrollViewSection({ node }: { node: ScrollViewNode }) {
  const update = useEditorStore((state) => state.updateScrollView);
  const settings = node.scrollView;
  const patch = (value: Partial<ScrollViewSettings>) => update(node.id, value);

  return <InspectorWindow title="Scroll View">
    <InspectorField label="Direction"><select value={settings.direction} onChange={(event) => patch({ direction: event.target.value as ScrollViewSettings["direction"] })}>
      <option value="vertical">Vertical</option>
      <option value="horizontal">Horizontal</option>
      <option value="both">Both</option>
    </select></InspectorField>
    <NumberField label="Padding left" value={settings.padding.left} step={1} onChange={(left) => patch({ padding: { ...settings.padding, left } })} />
    <NumberField label="Padding right" value={settings.padding.right} step={1} onChange={(right) => patch({ padding: { ...settings.padding, right } })} />
    <NumberField label="Padding top" value={settings.padding.top} step={1} onChange={(top) => patch({ padding: { ...settings.padding, top } })} />
    <NumberField label="Padding bottom" value={settings.padding.bottom} step={1} onChange={(bottom) => patch({ padding: { ...settings.padding, bottom } })} />
    <NumberField label="Item spacing" value={settings.itemSpacing} step={1} onChange={(itemSpacing) => patch({ itemSpacing })} />
    <NumberField label="Corner radius" value={settings.cornerRadius} step={1} onChange={(cornerRadius) => patch({ cornerRadius })} />
    <InspectorField label="Background color"><input type="checkbox" checked={settings.backgroundColor !== undefined} onChange={(event) => patch({ backgroundColor: event.target.checked ? "#00000000" : undefined })} /></InspectorField>
    {settings.backgroundColor !== undefined && <InspectorField label=" "><input type="color" value={settings.backgroundColor.slice(0, 7)} onChange={(event) => patch({ backgroundColor: event.target.value })} /></InspectorField>}
    <InspectorField label="Easing"><input type="checkbox" checked={settings.easingEnabled} onChange={(event) => patch({ easingEnabled: event.target.checked })} /></InspectorField>
    {settings.direction === "horizontal" && <InspectorField label="Shift + wheel"><input type="checkbox" checked={settings.shiftWheelHorizontal ?? false} onChange={(event) => patch({ shiftWheelHorizontal: event.target.checked })} /></InspectorField>}
  </InspectorWindow>;
}
