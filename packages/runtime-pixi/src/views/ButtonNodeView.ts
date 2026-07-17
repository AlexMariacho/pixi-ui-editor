import { BUTTON_STATE_KEYS, type ButtonStateKey, type UINode } from "@pixi-ui-editor/schema";
import { FancyButton } from "@pixi/ui";
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { NodeView, type SceneInteractionMode } from "./NodeView.js";

export type ButtonNode = Extract<UINode, { type: "button" }>;

const FANCY_STATE_BY_KEY = { normal: "default", hover: "hover", pressed: "pressed", disabled: "disabled" } as const;
const KEY_BY_FANCY_STATE = { default: "normal", hover: "hover", pressed: "pressed", disabled: "disabled" } as const;

/**
 * Adapts a button node to `@pixi/ui`'s `FancyButton`, which owns the pointer state machine —
 * this class never reimplements it. Optional states fall back to the normal image, and runtime
 * changes to `enabled` or the current state stay in the view: they never touch the document.
 */
export class ButtonNodeView extends NodeView {
  private readonly button: FancyButton;
  private readonly stateViews: Record<ButtonStateKey, Container>;
  private readonly interaction: SceneInteractionMode;
  private enabledState: boolean;

  constructor(node: ButtonNode, textures: ReadonlyMap<string, Texture> | undefined, interaction: SceneInteractionMode) {
    super(textures);
    this.interaction = interaction;
    const stateViews = {} as Record<ButtonStateKey, Container>;
    const normalTexture = textures?.get(node.states.normalAssetId);
    const viewFor = (state: ButtonStateKey, assetId: string | undefined): Container => {
      const texture = (assetId === undefined ? undefined : textures?.get(assetId)) ?? normalTexture;
      const view = texture === undefined ? new Graphics() : new Sprite(texture);
      stateViews[state] = view;
      return view;
    };

    this.button = new FancyButton({
      defaultView: viewFor("normal", node.states.normalAssetId),
      hoverView: viewFor("hover", node.states.hoverAssetId),
      pressedView: viewFor("pressed", node.states.pressedAssetId),
      disabledView: viewFor("disabled", node.states.disabledAssetId),
    });
    this.stateViews = stateViews;
    // Authoring-сцена инертна: FancyButton уже включил себе eventMode "static", снимаем его до applyEnabled.
    // Выделение и drag при этом не страдают: попадание ловит hitArea базового NodeView, а не это поддерево.
    if (interaction === "authoring") this.button.eventMode = "none";
    this.enabledState = node.enabled;
    this.applyEnabled(node.enabled);
    this.setContent(this.button);
  }

  /** In authoring mode `enabled` may only drive the visuals: `FancyButton` couples it to `eventMode`. */
  private applyEnabled(enabled: boolean): void {
    this.enabledState = enabled;
    if (this.interaction === "runtime") this.button.enabled = enabled;
    else this.button.setState(enabled ? "default" : "disabled");
  }

  protected syncContent(node: UINode, transform: UINode["transform"]): void {
    if (node.type !== "button") return;

    const normalTexture = this.textures?.get(node.states.normalAssetId);
    for (const state of BUTTON_STATE_KEYS) {
      const view = this.stateViews[state];
      const assetId = node.states[`${state}AssetId`];
      const texture = (assetId === undefined ? undefined : this.textures?.get(assetId)) ?? normalTexture;
      // State views are stable Sprite instances: changing an asset must not rebuild the scene
      // or replace FancyButton's display tree. Set the texture before the layout size: Sprite
      // preserves scale when its texture changes, so sizing it first would shift its visual bounds
      // for source images with different dimensions.
      if (view instanceof Sprite && texture !== undefined && view.texture !== texture) view.texture = texture;
      if (view instanceof Sprite) view.setSize(transform.width, transform.height);
      else if (view instanceof Graphics) view.clear().rect(0, 0, transform.width, transform.height).fill(0x4a5568).stroke({ width: 1, color: 0x94a3b8 });
    }

    // Только на изменение документа: иначе любой пересчёт layout сбрасывал бы transient preview state.
    if (node.enabled !== this.enabledState) this.applyEnabled(node.enabled);
  }

  get enabled(): boolean {
    return this.enabledState;
  }

  set enabled(value: boolean) {
    this.applyEnabled(value);
  }

  get state(): ButtonStateKey {
    return KEY_BY_FANCY_STATE[this.button.state];
  }

  /** Forces a visual state without changing `enabled`, so a disabled button still emits no press. */
  setState(state: ButtonStateKey): void {
    this.button.setState(FANCY_STATE_BY_KEY[state]);
  }

  get onPress(): FancyButton["onPress"] { return this.button.onPress; }
  get onDown(): FancyButton["onDown"] { return this.button.onDown; }
  get onUp(): FancyButton["onUp"] { return this.button.onUp; }
  get onHover(): FancyButton["onHover"] { return this.button.onHover; }
  get onOut(): FancyButton["onOut"] { return this.button.onOut; }
}
