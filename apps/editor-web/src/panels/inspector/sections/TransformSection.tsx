import { resolveProfileTransform } from "@pixi-ui-editor/runtime-pixi";
import type { UINode } from "@pixi-ui-editor/schema";
import { getNodeWorldMatrix } from "../../../canvas/transformCoordinates.js";
import { getEditingTarget, useEditorStore, type AnchorRect } from "../../../store/index.js";
import { AnchorField, isStretched } from "../AnchorField.js";
import { formatDegrees, InspectorField, InspectorWindow, NumberField, RotationField } from "../fields.js";
import { PivotField } from "../PivotField.js";

export function TransformSection({ node, readOnly }: { node: UINode; readOnly: boolean }) {
  const activeProfile = useEditorStore((state) => state.activeProfile);
  const updateNodeProfileTransform = useEditorStore((state) => state.updateNodeProfileTransform);
  const setNodeProfileAnchor = useEditorStore((state) => state.setNodeProfileAnchor);
  const setNodeOrientationVisibility = useEditorStore((state) => state.setNodeOrientationVisibility);
  const document = useEditorStore((state) => state.document);
  const sceneId = useEditorStore((state) => state.sceneId);
  const editingPrefabId = useEditorStore((state) => state.editingPrefabId);

  const resolvedTransform = resolveProfileTransform(node, activeProfile).transform;
  const owner = readOnly
    ? document.prefabs.find((prefab) => prefab.nodes.some((candidate) => candidate.id === node.id))
    : getEditingTarget(document, { sceneId, editingPrefabId });
  const worldTransform = owner === undefined ? undefined : getNodeWorldMatrix(owner, node.id, activeProfile);
  const updateTransform = (patch: Partial<UINode["transform"]>) => {
    updateNodeProfileTransform(node.id, patch);
  };

  const pivotX = resolvedTransform.pivotX ?? 0;
  const pivotY = resolvedTransform.pivotY ?? 0;
  const anchorMinX = resolvedTransform.anchorMinX ?? 0;
  const anchorMinY = resolvedTransform.anchorMinY ?? 0;
  const anchor: AnchorRect = {
    minX: anchorMinX,
    minY: anchorMinY,
    maxX: resolvedTransform.anchorMaxX ?? anchorMinX,
    maxY: resolvedTransform.anchorMaxY ?? anchorMinY,
  };
  const stretchX = isStretched(anchor.minX, anchor.maxX);
  const stretchY = isStretched(anchor.minY, anchor.maxY);

  return <>
    <InspectorWindow title="Layout Visibility">
      <InspectorField label="Horizontal"><input type="checkbox" checked={node.layoutOverrides?.desktop?.visible !== false} onChange={(event) => setNodeOrientationVisibility(node.id, "desktop", event.target.checked)} /></InspectorField>
      <InspectorField label="Vertical"><input type="checkbox" checked={node.layoutOverrides?.mobile?.visible !== false} onChange={(event) => setNodeOrientationVisibility(node.id, "mobile", event.target.checked)} /></InspectorField>
    </InspectorWindow>
    <InspectorWindow title="Transform">
      {/* Как в Unity: растянутая ось редактируется отступами от якорных точек. */}
      {stretchX
        ? <>
          <NumberField label="Left" value={resolvedTransform.x} step={1} onChange={(value) => updateTransform({ x: value, width: resolvedTransform.x + resolvedTransform.width - value })} />
          <NumberField label="Right" value={-(resolvedTransform.x + resolvedTransform.width)} step={1} onChange={(value) => updateTransform({ width: -value - resolvedTransform.x })} />
        </>
        : <NumberField label="Local X" value={resolvedTransform.x} step={1} onChange={(value) => updateTransform({ x: value })} />}
      {stretchY
        ? <>
          <NumberField label="Top" value={resolvedTransform.y} step={1} onChange={(value) => updateTransform({ y: value, height: resolvedTransform.y + resolvedTransform.height - value })} />
          <NumberField label="Bottom" value={-(resolvedTransform.y + resolvedTransform.height)} step={1} onChange={(value) => updateTransform({ height: -value - resolvedTransform.y })} />
        </>
        : <NumberField label="Local Y" value={resolvedTransform.y} step={1} onChange={(value) => updateTransform({ y: value })} />}
      <InspectorField label="Global X"><output>{worldTransform === undefined ? "—" : formatDegrees(worldTransform.tx)}</output></InspectorField>
      <InspectorField label="Global Y"><output>{worldTransform === undefined ? "—" : formatDegrees(worldTransform.ty)}</output></InspectorField>
      {!stretchX && <NumberField label="Width" value={resolvedTransform.width} step={1} onChange={(value) => updateTransform({ width: value })} />}
      {!stretchY && <NumberField label="Height" value={resolvedTransform.height} step={1} onChange={(value) => updateTransform({ height: value })} />}
      <NumberField label="Scale X" value={resolvedTransform.scaleX} step={0.1} onChange={(value) => updateTransform({ scaleX: value })} />
      <NumberField label="Scale Y" value={resolvedTransform.scaleY} step={0.1} onChange={(value) => updateTransform({ scaleY: value })} />
      <RotationField radians={resolvedTransform.rotation} onChangeRadians={(value) => updateTransform({ rotation: value })} />
      <AnchorField anchor={anchor} onSelect={(nextAnchor, options) => setNodeProfileAnchor(node.id, nextAnchor, options)} />
      <PivotField pivotX={pivotX} pivotY={pivotY} onChange={(x, y) => updateTransform({ pivotX: x, pivotY: y })} />
    </InspectorWindow>
  </>;
}
