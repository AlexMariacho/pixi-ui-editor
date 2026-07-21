import type { ParticleEffectDefinition, UINode } from "@pixi-ui-editor/schema";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow, NumberField } from "../fields.js";

export function ParticleSection({ node }: { node: Extract<UINode, { type: "particle-emitter" }> }) {
  const document = useEditorStore((state) => state.document);
  const state = useEditorStore();
  const effect = document.effects.find((item): item is ParticleEffectDefinition => item.id === node.effectId && item.type === "particles");
  if (effect === undefined) return null;
  const images = document.assets.filter((asset) => asset.type === "image");
  const usage = [...document.scenes, ...document.prefabs].flatMap((owner) => owner.nodes).filter((item) => item.type === "particle-emitter" && item.effectId === effect.id).length;
  const patch = (value: Partial<ParticleEffectDefinition>) => state.updateParticleEffect(effect.id, value);
  const p = effect.particle;
  const field = (label: string, value: number, change: (value: number) => void) => <NumberField label={label} value={value} step={0.01} onChange={change} />;
  return <>
    <InspectorWindow title="Particle Effect">
      <InspectorField label="Definition"><select value={effect.id} onChange={(event) => state.assignParticleEffect(node.id, event.target.value)}>{document.effects.filter((item) => item.type === "particles").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></InspectorField>
      <button type="button" onClick={() => state.createParticleEffect()}>New</button><button type="button" onClick={() => state.duplicateParticleEffect(node.id)}>Duplicate</button><button type="button" onClick={() => { const name = window.prompt("Effect name", effect.name); if (name) state.renameParticleEffect(effect.id, name); }}>Rename</button><button type="button" disabled={usage > 0} onClick={() => state.deleteParticleEffect(effect.id)}>Delete</button>
      <p>{usage} instances share this definition.</p>
    </InspectorWindow>
    <InspectorWindow title="Playback">
      <InspectorField label="Autoplay"><input type="checkbox" checked={node.autoplay} onChange={(event) => state.updateParticleEmitter(node.id, { autoplay: event.target.checked })} /></InspectorField>
      <InspectorField label="Space"><select value={node.simulationSpace} onChange={(event) => state.updateParticleEmitter(node.id, { simulationSpace: event.target.value as "local" | "world" })}><option>local</option><option>world</option></select></InspectorField>
      {field("Seed", effect.seed, (seed) => patch({ seed: Math.max(0, Math.trunc(seed)) }))}{field("Max particles", effect.maxParticles, (maxParticles) => patch({ maxParticles: Math.max(1, Math.trunc(maxParticles)) }))}
      <button type="button" onClick={() => state.controlParticlePlayback(node.id, "play")}>Play</button><button type="button" onClick={() => state.controlParticlePlayback(node.id, "pause")}>Pause</button><button type="button" onClick={() => state.controlParticlePlayback(node.id, "restart")}>Restart</button><button type="button" onClick={() => state.controlParticlePlayback(node.id, "step")}>Step 1/60</button>
      <p>active {state.particleDiagnostics[node.id]?.active ?? 0} / free {state.particleDiagnostics[node.id]?.free ?? effect.maxParticles} / dropped {state.particleDiagnostics[node.id]?.dropped ?? 0}</p>
    </InspectorWindow>
    <InspectorWindow title="Emission">
      {field("Delay", effect.emission.delay, (delay) => patch({ emission: { ...effect.emission, delay } }))}{field("Duration", effect.emission.duration, (duration) => patch({ emission: { ...effect.emission, duration } }))}{field("Rate", effect.emission.rate, (rate) => patch({ emission: { ...effect.emission, rate: Math.max(0, rate) } }))}
      <InspectorField label="Loop"><input type="checkbox" checked={effect.emission.loop} onChange={(event) => patch({ emission: { ...effect.emission, loop: event.target.checked } })} /></InspectorField>
      <button type="button" onClick={() => patch({ emission: { ...effect.emission, bursts: [...effect.emission.bursts, { time: 0, count: 1 }] } })}>Add burst</button>
      {effect.emission.bursts.map((burst, index) => <InspectorField key={index} label={`Burst ${index + 1}`}><input type="number" value={burst.time} onChange={(event) => { const time = Number(event.target.value); if (Number.isFinite(time)) patch({ emission: { ...effect.emission, bursts: effect.emission.bursts.map((item, i) => i === index ? { ...item, time } : item) } }); }} /><button type="button" onClick={() => patch({ emission: { ...effect.emission, bursts: effect.emission.bursts.filter((_, i) => i !== index) } })}>Remove</button></InspectorField>)}
    </InspectorWindow>
    <InspectorWindow title="Particle">
      {field("Lifetime min", p.lifetime.min, (min) => patch({ particle: { ...p, lifetime: { ...p.lifetime, min } } }))}{field("Lifetime max", p.lifetime.max, (max) => patch({ particle: { ...p, lifetime: { ...p.lifetime, max } } }))}
      <InspectorField label="Spawn shape"><select value={p.spawnShape.type} onChange={(event) => patch({ particle: { ...p, spawnShape: { type: event.target.value as "point" | "rectangle" | "circle" } } })}><option>point</option><option>rectangle</option><option>circle</option></select></InspectorField>
    </InspectorWindow>
    <InspectorWindow title="Movement">
      {field("Speed min", p.movement.speed.min, (min) => patch({ particle: { ...p, movement: { ...p.movement, speed: { ...p.movement.speed, min } } } }))}{field("Speed max", p.movement.speed.max, (max) => patch({ particle: { ...p, movement: { ...p.movement, speed: { ...p.movement.speed, max } } } }))}{field("Direction", p.movement.directionDegrees, (directionDegrees) => patch({ particle: { ...p, movement: { ...p.movement, directionDegrees } } }))}{field("Spread", p.movement.spreadDegrees, (spreadDegrees) => patch({ particle: { ...p, movement: { ...p.movement, spreadDegrees } } }))}{field("Gravity X", p.movement.accelerationX, (accelerationX) => patch({ particle: { ...p, movement: { ...p.movement, accelerationX } } }))}{field("Gravity Y", p.movement.accelerationY, (accelerationY) => patch({ particle: { ...p, movement: { ...p.movement, accelerationY } } }))}{field("Drag", p.movement.drag, (drag) => patch({ particle: { ...p, movement: { ...p.movement, drag: Math.max(0, drag) } } }))}
    </InspectorWindow>
    <InspectorWindow title="Appearance">
      <InspectorField label="Source"><select value={p.visual.source.type} onChange={(event) => { const id = images[0]?.id; if (!id) return; const source = event.target.value === "single" ? { type: "single" as const, assetId: id } : event.target.value === "random" ? { type: "random" as const, assetIds: [id] } : { type: "sequence" as const, assetIds: [id], fps: 12, loop: true, randomStartFrame: false }; patch({ particle: { ...p, visual: { ...p.visual, source } } }); }}><option value="single">single</option><option value="random">random</option><option value="sequence">sequence</option></select></InspectorField>
      <InspectorField label="Image"><select value={p.visual.source.type === "single" ? p.visual.source.assetId : p.visual.source.assetIds[0]} onChange={(event) => { const source = p.visual.source.type === "single" ? { ...p.visual.source, assetId: event.target.value } : { ...p.visual.source, assetIds: [event.target.value] }; patch({ particle: { ...p, visual: { ...p.visual, source } } }); }}>{images.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></InspectorField>
      <InspectorField label="Blend"><select value={p.visual.blendMode} onChange={(event) => patch({ particle: { ...p, visual: { ...p.visual, blendMode: event.target.value as typeof p.visual.blendMode } } })}>{["normal", "add", "multiply", "screen"].map((value) => <option key={value}>{value}</option>)}</select></InspectorField>
      <InspectorField label="Tint"><input type="color" value={p.visual.tint.start.slice(0, 7)} onChange={(event) => patch({ particle: { ...p, visual: { ...p.visual, tint: { ...p.visual.tint, start: event.target.value } } } })} /></InspectorField>
    </InspectorWindow>
  </>;
}
