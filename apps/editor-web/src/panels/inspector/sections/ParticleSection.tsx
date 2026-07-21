import { useEffect, useState } from "react";
import { validateProjectDocument, type ParticleEffectDefinition, type ProjectDocument, type UINode } from "@pixi-ui-editor/schema";
import { listImageAssetOptions } from "../../../shared/assets.js";
import { useEditorStore } from "../../../store/index.js";
import { InspectorField, InspectorWindow, NumberField } from "../fields.js";

type ParticleSource = ParticleEffectDefinition["particle"]["visual"]["source"];

function usageOf(document: ProjectDocument, effectId: string): number {
  return [...document.scenes, ...document.prefabs].flatMap((owner) => owner.nodes).filter((node) => node.type === "particle-emitter" && node.effectId === effectId).length;
}

/** Validates a candidate patch client-side before committing, so an invalid edit shows an inline error
 * at the offending field instead of silently no-op-ing in the store (the store itself never partially
 * mutates the document either way, since it always validates the whole cloned candidate). */
function useValidatedEffectPatch(effectId: string) {
  const document = useEditorStore((state) => state.document);
  const updateParticleEffect = useEditorStore((state) => state.updateParticleEffect);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The Inspector reuses one ParticleSection instance across selections, so stale errors from a
  // previously edited effect must not linger once the author switches to a different one.
  useEffect(() => setErrors({}), [effectId]);

  const patch = (key: string, value: Partial<ParticleEffectDefinition>) => {
    const candidate = structuredClone(document);
    const target = candidate.effects.find((item) => item.id === effectId);
    if (target === undefined) return;
    Object.assign(target, value);
    const validation = validateProjectDocument(candidate);
    if (!validation.valid) {
      setErrors((current) => ({ ...current, [key]: validation.issues[0]?.message ?? "Invalid value." }));
      return;
    }
    setErrors((current) => (key in current ? Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)) : current));
    updateParticleEffect(effectId, value);
  };

  return { patch, errors };
}

/** Every particle effect definition in the project, with usage and Delete — separate from the New/Duplicate/Rename
 * flow above because the definition currently assigned to this node always shows usage > 0 for itself; only this
 * list lets the author reach a definition that has become genuinely unused (e.g. after reassigning it away). */
function DefinitionsList({ document, currentEffectId }: { document: ProjectDocument; currentEffectId: string }) {
  const deleteParticleEffect = useEditorStore((state) => state.deleteParticleEffect);
  const definitions = document.effects.filter((item): item is ParticleEffectDefinition => item.type === "particles");
  return <details className="particle-definitions-list">
    <summary>Manage all definitions ({definitions.length})</summary>
    {definitions.map((item) => {
      const usage = usageOf(document, item.id);
      return <div key={item.id} className="particle-definition-row">
        <span>{item.name}{item.id === currentEffectId ? " (current)" : ""}</span>
        <span>{usage} instance{usage === 1 ? "" : "s"}</span>
        <button type="button" disabled={usage > 0} title={usage > 0 ? `Used by ${usage} instance(s)` : undefined} onClick={() => deleteParticleEffect(item.id)}>Delete</button>
      </div>;
    })}
  </details>;
}

function SourceListEditor({ source, options, onChange }: { source: Extract<ParticleSource, { type: "random" | "sequence" }>; options: { id: string; label: string }[]; onChange: (assetIds: string[]) => void }) {
  const move = (index: number, delta: number) => {
    const next = [...source.assetIds];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };
  return <div className="particle-source-list">
    {source.assetIds.map((assetId, index) => <div key={index} className="particle-source-row">
      <select value={assetId} onChange={(event) => onChange(source.assetIds.map((item, i) => i === index ? event.target.value : item))}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move source up">▲</button>
      <button type="button" disabled={index === source.assetIds.length - 1} onClick={() => move(index, 1)} aria-label="Move source down">▼</button>
      <button type="button" disabled={source.assetIds.length <= 1} onClick={() => onChange(source.assetIds.filter((_, i) => i !== index))}>Remove</button>
    </div>)}
    <button type="button" disabled={options.length === 0} onClick={() => onChange([...source.assetIds, options[0]!.id])}>Add source</button>
  </div>;
}

export function ParticleSection({ node }: { node: Extract<UINode, { type: "particle-emitter" }> }) {
  const document = useEditorStore((state) => state.document);
  const state = useEditorStore();
  const effect = document.effects.find((item): item is ParticleEffectDefinition => item.id === node.effectId && item.type === "particles");
  if (effect === undefined) return null;
  const imageOptions = listImageAssetOptions(document.assets);
  const usage = usageOf(document, effect.id);
  const { patch, errors } = useValidatedEffectPatch(effect.id);
  const p = effect.particle;
  const v = p.visual;
  const field = (label: string, key: string, value: number, change: (value: number) => void, step = 0.01) => <NumberField label={label} value={value} step={step} error={errors[key]} onChange={change} />;
  const diagnostics = state.particleDiagnostics[node.id];
  const status = diagnostics === undefined ? (node.autoplay ? "playing" : "paused") : diagnostics.disposed ? "disposed" : diagnostics.playing ? "playing" : diagnostics.stopped ? "stopped" : "paused";

  return <>
    <InspectorWindow title="Particle Effect">
      <InspectorField label="Definition"><select value={effect.id} onChange={(event) => state.assignParticleEffect(node.id, event.target.value)}>{document.effects.filter((item) => item.type === "particles").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></InspectorField>
      <button type="button" onClick={() => state.createParticleEffect()}>New</button><button type="button" onClick={() => state.duplicateParticleEffect(node.id)}>Duplicate</button><button type="button" onClick={() => { const name = window.prompt("Effect name", effect.name); if (name) state.renameParticleEffect(effect.id, name); }}>Rename</button>
      <p>{usage} instance{usage === 1 ? "" : "s"} share this definition.</p>
      <DefinitionsList document={document} currentEffectId={effect.id} />
    </InspectorWindow>
    <InspectorWindow title="Playback">
      <InspectorField label="Autoplay"><input type="checkbox" checked={node.autoplay} onChange={(event) => state.updateParticleEmitter(node.id, { autoplay: event.target.checked })} /></InspectorField>
      <InspectorField label="Space"><select value={node.simulationSpace} onChange={(event) => state.updateParticleEmitter(node.id, { simulationSpace: event.target.value as "local" | "world" })}><option>local</option><option>world</option></select></InspectorField>
      {field("Seed", "seed", effect.seed, (seed) => patch("seed", { seed: Math.max(0, Math.trunc(seed)) }), 1)}{field("Max particles", "maxParticles", effect.maxParticles, (maxParticles) => patch("maxParticles", { maxParticles: Math.max(1, Math.trunc(maxParticles)) }), 1)}
      <div className="particle-playback-buttons" role="group" aria-label="Particle playback">
        <button type="button" className={status === "playing" ? "particle-playback-active" : undefined} onClick={() => state.controlParticlePlayback(node.id, "play")}>Play</button>
        <button type="button" className={status === "paused" ? "particle-playback-active" : undefined} onClick={() => state.controlParticlePlayback(node.id, "pause")}>Pause</button>
        <button type="button" title="Advance exactly one fixed step (1/60 s)" onClick={() => state.controlParticlePlayback(node.id, "step")}>Step</button>
        <button type="button" onClick={() => state.controlParticlePlayback(node.id, "restart")}>Restart</button>
        <button type="button" className={status === "stopped" ? "particle-playback-active" : undefined} onClick={() => state.controlParticlePlayback(node.id, "stop")}>Stop</button>
      </div>
      <p className="particle-playback-status">active {diagnostics?.active ?? 0} / free {diagnostics?.free ?? effect.maxParticles} / dropped {diagnostics?.dropped ?? 0} — {status}</p>
    </InspectorWindow>
    <InspectorWindow title="Emission">
      {field("Delay", "emission.delay", effect.emission.delay, (delay) => patch("emission.delay", { emission: { ...effect.emission, delay: Math.max(0, delay) } }))}
      {field("Duration", "emission.duration", effect.emission.duration, (duration) => patch("emission.duration", { emission: { ...effect.emission, duration } }))}
      {field("Rate", "emission.rate", effect.emission.rate, (rate) => patch("emission.rate", { emission: { ...effect.emission, rate: Math.max(0, rate) } }))}
      <InspectorField label="Loop"><input type="checkbox" checked={effect.emission.loop} onChange={(event) => patch("emission.loop", { emission: { ...effect.emission, loop: event.target.checked } })} /></InspectorField>
      <button type="button" onClick={() => patch("emission.bursts", { emission: { ...effect.emission, bursts: [...effect.emission.bursts, { time: 0, count: 1 }] } })}>Add burst</button>
      {effect.emission.bursts.map((burst, index) => <div key={index} className="particle-burst-row">
        <NumberField label={`Burst ${index + 1} time`} value={burst.time} step={0.01} error={errors[`emission.bursts.${index}.time`]} onChange={(time) => patch(`emission.bursts.${index}.time`, { emission: { ...effect.emission, bursts: effect.emission.bursts.map((item, i) => i === index ? { ...item, time: Math.max(0, time) } : item) } })} />
        <NumberField label="Count" value={burst.count} step={1} error={errors[`emission.bursts.${index}.count`]} onChange={(count) => patch(`emission.bursts.${index}.count`, { emission: { ...effect.emission, bursts: effect.emission.bursts.map((item, i) => i === index ? { ...item, count: Math.max(1, Math.trunc(count)) } : item) } })} />
        <button type="button" onClick={() => patch("emission.bursts", { emission: { ...effect.emission, bursts: effect.emission.bursts.filter((_, i) => i !== index) } })}>Remove</button>
      </div>)}
    </InspectorWindow>
    <InspectorWindow title="Particle">
      {field("Lifetime min", "particle.lifetime", p.lifetime.min, (min) => patch("particle.lifetime", { particle: { ...p, lifetime: { ...p.lifetime, min } } }))}
      {field("Lifetime max", "particle.lifetime", p.lifetime.max, (max) => patch("particle.lifetime", { particle: { ...p, lifetime: { ...p.lifetime, max } } }))}
      <InspectorField label="Spawn shape"><select value={p.spawnShape.type} onChange={(event) => patch("particle.spawnShape", { particle: { ...p, spawnShape: { type: event.target.value as "point" | "rectangle" | "circle" } } })}><option>point</option><option>rectangle</option><option>circle</option></select></InspectorField>
    </InspectorWindow>
    <InspectorWindow title="Movement">
      {field("Speed min", "movement.speed", p.movement.speed.min, (min) => patch("movement.speed", { particle: { ...p, movement: { ...p.movement, speed: { ...p.movement.speed, min } } } }))}
      {field("Speed max", "movement.speed", p.movement.speed.max, (max) => patch("movement.speed", { particle: { ...p, movement: { ...p.movement, speed: { ...p.movement.speed, max } } } }))}
      {field("Direction", "movement.directionDegrees", p.movement.directionDegrees, (directionDegrees) => patch("movement.directionDegrees", { particle: { ...p, movement: { ...p.movement, directionDegrees } } }))}
      {field("Spread", "movement.spreadDegrees", p.movement.spreadDegrees, (spreadDegrees) => patch("movement.spreadDegrees", { particle: { ...p, movement: { ...p.movement, spreadDegrees } } }))}
      {field("Acceleration X", "movement.accelerationX", p.movement.accelerationX, (accelerationX) => patch("movement.accelerationX", { particle: { ...p, movement: { ...p.movement, accelerationX } } }))}
      {field("Acceleration Y", "movement.accelerationY", p.movement.accelerationY, (accelerationY) => patch("movement.accelerationY", { particle: { ...p, movement: { ...p.movement, accelerationY } } }))}
      {field("Drag", "movement.drag", p.movement.drag, (drag) => patch("movement.drag", { particle: { ...p, movement: { ...p.movement, drag: Math.max(0, drag) } } }))}
    </InspectorWindow>
    <InspectorWindow title="Appearance">
      <InspectorField label="Source"><select value={v.source.type} onChange={(event) => { const id = imageOptions[0]?.id; if (!id) return; const source: ParticleSource = event.target.value === "single" ? { type: "single", assetId: id } : event.target.value === "random" ? { type: "random", assetIds: [id] } : { type: "sequence", assetIds: [id], fps: 12, loop: true, randomStartFrame: false }; patch("visual.source", { particle: { ...p, visual: { ...v, source } } }); }}><option value="single">single</option><option value="random">random</option><option value="sequence">sequence</option></select></InspectorField>
      {v.source.type === "single"
        ? <InspectorField label="Image" error={errors["visual.source"]}><select value={v.source.assetId} onChange={(event) => patch("visual.source", { particle: { ...p, visual: { ...v, source: { type: "single", assetId: event.target.value } } } })}>{imageOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></InspectorField>
        : <InspectorField label="Sources" error={errors["visual.source"]}><SourceListEditor source={v.source} options={imageOptions} onChange={(assetIds) => patch("visual.source", { particle: { ...p, visual: { ...v, source: { ...v.source, assetIds } as ParticleSource } } })} /></InspectorField>}
      {v.source.type === "sequence" && <>
        <NumberField label="Sequence FPS" value={v.source.fps} step={1} error={errors["visual.source.fps"]} onChange={(fps) => patch("visual.source.fps", { particle: { ...p, visual: { ...v, source: { ...v.source as Extract<ParticleSource, { type: "sequence" }>, fps: Math.max(0.01, fps) } } } })} />
        <InspectorField label="Sequence loop"><input type="checkbox" checked={v.source.loop} onChange={(event) => patch("visual.source.loop", { particle: { ...p, visual: { ...v, source: { ...v.source as Extract<ParticleSource, { type: "sequence" }>, loop: event.target.checked } } } })} /></InspectorField>
        <InspectorField label="Random start"><input type="checkbox" checked={v.source.randomStartFrame} onChange={(event) => patch("visual.source.randomStartFrame", { particle: { ...p, visual: { ...v, source: { ...v.source as Extract<ParticleSource, { type: "sequence" }>, randomStartFrame: event.target.checked } } } })} /></InspectorField>
      </>}
      <InspectorField label="Blend"><select value={v.blendMode} onChange={(event) => patch("visual.blendMode", { particle: { ...p, visual: { ...v, blendMode: event.target.value as typeof v.blendMode } } })}>{["normal", "add", "multiply", "screen"].map((value) => <option key={value}>{value}</option>)}</select></InspectorField>
      {field("Alpha start", "visual.alpha", v.alpha.start, (start) => patch("visual.alpha", { particle: { ...p, visual: { ...v, alpha: { ...v.alpha, start } } } }))}
      {field("Alpha end", "visual.alpha", v.alpha.end, (end) => patch("visual.alpha", { particle: { ...p, visual: { ...v, alpha: { ...v.alpha, end } } } }))}
      {field("Scale start min", "visual.scale.start", v.scale.start.min, (min) => patch("visual.scale.start", { particle: { ...p, visual: { ...v, scale: { ...v.scale, start: { ...v.scale.start, min } } } } }))}
      {field("Scale start max", "visual.scale.start", v.scale.start.max, (max) => patch("visual.scale.start", { particle: { ...p, visual: { ...v, scale: { ...v.scale, start: { ...v.scale.start, max } } } } }))}
      {field("Scale end min", "visual.scale.end", v.scale.end.min, (min) => patch("visual.scale.end", { particle: { ...p, visual: { ...v, scale: { ...v.scale, end: { ...v.scale.end, min } } } } }))}
      {field("Scale end max", "visual.scale.end", v.scale.end.max, (max) => patch("visual.scale.end", { particle: { ...p, visual: { ...v, scale: { ...v.scale, end: { ...v.scale.end, max } } } } }))}
      <InspectorField label="Tint start"><input type="color" value={v.tint.start.slice(0, 7)} onChange={(event) => patch("visual.tint", { particle: { ...p, visual: { ...v, tint: { ...v.tint, start: event.target.value } } } })} /></InspectorField>
      <InspectorField label="Tint end"><input type="color" value={v.tint.end.slice(0, 7)} onChange={(event) => patch("visual.tint", { particle: { ...p, visual: { ...v, tint: { ...v.tint, end: event.target.value } } } })} /></InspectorField>
      {field("Rotation min", "visual.rotation.initialDegrees", v.rotation.initialDegrees.min, (min) => patch("visual.rotation.initialDegrees", { particle: { ...p, visual: { ...v, rotation: { ...v.rotation, initialDegrees: { ...v.rotation.initialDegrees, min } } } } }))}
      {field("Rotation max", "visual.rotation.initialDegrees", v.rotation.initialDegrees.max, (max) => patch("visual.rotation.initialDegrees", { particle: { ...p, visual: { ...v, rotation: { ...v.rotation, initialDegrees: { ...v.rotation.initialDegrees, max } } } } }))}
      {field("Angular vel. min", "visual.rotation.angularVelocityDegrees", v.rotation.angularVelocityDegrees.min, (min) => patch("visual.rotation.angularVelocityDegrees", { particle: { ...p, visual: { ...v, rotation: { ...v.rotation, angularVelocityDegrees: { ...v.rotation.angularVelocityDegrees, min } } } } }))}
      {field("Angular vel. max", "visual.rotation.angularVelocityDegrees", v.rotation.angularVelocityDegrees.max, (max) => patch("visual.rotation.angularVelocityDegrees", { particle: { ...p, visual: { ...v, rotation: { ...v.rotation, angularVelocityDegrees: { ...v.rotation.angularVelocityDegrees, max } } } } }))}
    </InspectorWindow>
  </>;
}
