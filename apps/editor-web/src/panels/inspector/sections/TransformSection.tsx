import { resolveProfileTransform } from "@pixi-ui-editor/runtime-pixi";
import { isLayoutGroup, isPositionManagingContainer, type UINode } from "@pixi-ui-editor/schema";
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
  const updateLayoutItem = useEditorStore((state) => state.updateLayoutItem);
  const document = useEditorStore((state) => state.document);
  const sceneId = useEditorStore((state) => state.sceneId);
  const editingPrefabId = useEditorStore((state) => state.editingPrefabId);

  const resolvedTransform = resolveProfileTransform(node, activeProfile).transform;
  const owner = readOnly
    ? document.prefabs.find((prefab) => prefab.nodes.some((candidate) => candidate.id === node.id))
    : getEditingTarget(document, { sceneId, editingPrefabId });
  const parent = owner?.nodes.find((candidate) => candidate.id === node.parentId);
  // Ребёнок layout group или scroll-view не владеет собственной позицией — её задаёт Yoga solver или
  // @pixi/ui List; только layout group дополнительно даёт per-item flexGrow/shrink/basis настройки.
  const managedByLayout = parent !== undefined && isPositionManagingContainer(parent);
  const managedByLayoutGroup = parent !== undefined && isLayoutGroup(parent);
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
      {managedByLayout && <p className="inspector-hint">Position, anchors and size are controlled by the parent {managedByLayoutGroup ? "Layout Group" : "Scroll View"}.</p>}
      {managedByLayoutGroup && <InspectorWindow title="Layout Item">
        <NumberField label="Flex grow" value={node.layoutItem?.flexGrow ?? 0} step={0.1} onChange={(flexGrow) => updateLayoutItem(node.id, { flexGrow })} />
        <NumberField label="Flex shrink" value={node.layoutItem?.flexShrink ?? 0} step={0.1} onChange={(flexShrink) => updateLayoutItem(node.id, { flexShrink })} />
        <NumberField label="Flex basis" value={node.layoutItem?.flexBasis ?? 0} step={1} onChange={(flexBasis) => updateLayoutItem(node.id, { flexBasis: flexBasis <= 0 ? undefined : flexBasis })} />
      </InspectorWindow>}
      {/* Как в Unity: растянутая ось редактируется отступами от якорных точек. */}
      {!managedByLayout && (stretchX
        ? <>
          <NumberField label="Left" value={resolvedTransform.x} step={1} onChange={(value) => updateTransform({ x: value, width: resolvedTransform.x + resolvedTransform.width - value })} />
          <NumberField label="Right" value={-(resolvedTransform.x + resolvedTransform.width)} step={1} onChange={(value) => updateTransform({ width: -value - resolvedTransform.x })} />
        </>
        : <NumberField label="Local X" value={resolvedTransform.x} step={1} onChange={(value) => updateTransform({ x: value })} />)}
      {!managedByLayout && (stretchY
        ? <>
          <NumberField label="Top" value={resolvedTransform.y} step={1} onChange={(value) => updateTransform({ y: value, height: resolvedTransform.y + resolvedTransform.height - value })} />
          <NumberField label="Bottom" value={-(resolvedTransform.y + resolvedTransform.height)} step={1} onChange={(value) => updateTransform({ height: -value - resolvedTransform.y })} />
        </>
        : <NumberField label="Local Y" value={resolvedTransform.y} step={1} onChange={(value) => updateTransform({ y: value })} />)}
      <InspectorField label="Global X"><output>{worldTransform === undefined ? "—" : formatDegrees(worldTransform.tx)}</output></InspectorField>
      <InspectorField label="Global Y"><output>{worldTransform === undefined ? "—" : formatDegrees(worldTransform.ty)}</output></InspectorField>
      {!managedByLayout && !stretchX && <NumberField label="Width" value={resolvedTransform.width} step={1} onChange={(value) => updateTransform({ width: value })} />}
      {!managedByLayout && !stretchY && <NumberField label="Height" value={resolvedTransform.height} step={1} onChange={(value) => updateTransform({ height: value })} />}
      <NumberField label="Scale X" value={resolvedTransform.scaleX} step={0.1} onChange={(value) => updateTransform({ scaleX: value })} />
      <NumberField label="Scale Y" value={resolvedTransform.scaleY} step={0.1} onChange={(value) => updateTransform({ scaleY: value })} />
      <RotationField radians={resolvedTransform.rotation} onChangeRadians={(value) => updateTransform({ rotation: value })} />
      {!managedByLayout && <AnchorField anchor={anchor} onSelect={(nextAnchor, options) => setNodeProfileAnchor(node.id, nextAnchor, options)} />}
      <PivotField pivotX={pivotX} pivotY={pivotY} onChange={(x, y) => updateTransform({ pivotX: x, pivotY: y })} />
    </InspectorWindow>
  </>;
}
