import { createStableId, type ParticleEffectDefinition, type UINode } from "@pixi-ui-editor/schema";
import { commitCandidate } from "./helpers.js";
import type { EditorSlice } from "./types.js";

type Keys = "createParticleEffect" | "assignParticleEffect" | "updateParticleEffect" | "updateParticleEmitter" | "duplicateParticleEffect" | "renameParticleEffect" | "deleteParticleEffect" | "controlParticlePlayback" | "reportParticleDiagnostics";

export function createDefaultParticleEffect(id: string, name: string): ParticleEffectDefinition {
  return { id, name, type: "particles", maxParticles: 128, seed: 1, emission: { delay: 0, duration: 1, loop: true, rate: 24, bursts: [] }, particle: { lifetime: { min: .5, max: 1 }, spawnShape: { type: "point" }, movement: { speed: { min: 35, max: 65 }, directionDegrees: 270, spreadDegrees: 35, accelerationX: 0, accelerationY: 0, drag: 0 }, visual: { source: { type: "single", assetId: "" }, alpha: { start: 1, end: 0 }, scale: { start: { min: .5, max: 1 }, end: { min: .1, max: .4 } }, tint: { start: "#FFFFFF", end: "#FFFFFF" }, rotation: { initialDegrees: { min: 0, max: 0 }, angularVelocityDegrees: { min: 0, max: 0 } }, blendMode: "normal" } } };
}

function usedBy(document: { scenes: { nodes: UINode[] }[]; prefabs: { nodes: UINode[] }[] }, effectId: string): number {
  return [...document.scenes, ...document.prefabs].flatMap((owner) => owner.nodes).filter((node) => node.type === "particle-emitter" && node.effectId === effectId).length;
}

export const createParticlesSlice: EditorSlice<Keys> = (set, get) => ({
  createParticleEffect: (name) => {
    const state = get(); const candidate = structuredClone(state.document); const asset = candidate.assets.find((item) => item.type === "image");
    if (asset === undefined) { console.warn("Cannot create a particle effect without an image asset."); return null; }
    const id = createStableId(); const effect = createDefaultParticleEffect(id, name ?? `Particles ${candidate.effects.filter((item) => item.type === "particles").length + 1}`); if (effect.particle.visual.source.type === "single") effect.particle.visual.source.assetId = asset.id;
    candidate.effects.push(effect); const committed = commitCandidate(state, candidate, "Particle effect creation was rejected because it makes the project document invalid.");
    if (committed !== state) set(committed); return committed === state ? null : id;
  },
  assignParticleEffect: (nodeId, effectId) => set((state) => {
    const candidate = structuredClone(state.document); const node = [...candidate.scenes, ...candidate.prefabs].flatMap((owner) => owner.nodes).find((item) => item.id === nodeId);
    if (node?.type !== "particle-emitter" || !candidate.effects.some((effect) => effect.id === effectId && effect.type === "particles")) return state;
    node.effectId = effectId; return commitCandidate(state, candidate, "Particle effect assignment was rejected because it makes the project document invalid.");
  }),
  updateParticleEffect: (effectId, patch) => set((state) => {
    const candidate = structuredClone(state.document); const effect = candidate.effects.find((item) => item.id === effectId && item.type === "particles");
    if (effect === undefined) return state;
    Object.assign(effect, patch); return commitCandidate(state, candidate, "Particle effect update was rejected because it makes the project document invalid.");
  }),
  updateParticleEmitter: (nodeId, patch) => set((state) => { const candidate = structuredClone(state.document); const node = [...candidate.scenes, ...candidate.prefabs].flatMap((owner) => owner.nodes).find((item) => item.id === nodeId); if (node?.type !== "particle-emitter") return state; Object.assign(node, patch); return commitCandidate(state, candidate, "Particle emitter update was rejected because it makes the project document invalid."); }),
  duplicateParticleEffect: (nodeId) => set((state) => {
    const candidate = structuredClone(state.document); const node = [...candidate.scenes, ...candidate.prefabs].flatMap((owner) => owner.nodes).find((item) => item.id === nodeId);
    if (node?.type !== "particle-emitter") return state; const source = candidate.effects.find((effect) => effect.id === node.effectId && effect.type === "particles"); if (source === undefined) return state;
    const copy = structuredClone(source); copy.id = createStableId(); copy.name = `${source.name} Copy`; candidate.effects.push(copy); node.effectId = copy.id;
    return commitCandidate(state, candidate, "Particle effect duplication was rejected because it makes the project document invalid.");
  }),
  renameParticleEffect: (effectId, name) => set((state) => { const candidate = structuredClone(state.document); const effect = candidate.effects.find((item) => item.id === effectId); if (effect === undefined) return state; effect.name = name; return commitCandidate(state, candidate, "Particle effect rename was rejected because it makes the project document invalid."); }),
  deleteParticleEffect: (effectId) => set((state) => { if (usedBy(state.document, effectId) > 0) { console.warn("Cannot delete a particle effect while it is used by emitters."); return state; } const candidate = structuredClone(state.document); const index = candidate.effects.findIndex((effect) => effect.id === effectId); if (index < 0) return state; candidate.effects.splice(index, 1); return commitCandidate(state, candidate, "Particle effect deletion was rejected because it makes the project document invalid."); }),
  controlParticlePlayback: (nodeId, action) => set((state) => ({ particlePlayback: { ...state.particlePlayback, [nodeId]: action } })),
  reportParticleDiagnostics: (nodeId, diagnostics) => set((state) => ({ particleDiagnostics: { ...state.particleDiagnostics, [nodeId]: diagnostics } })),
});
