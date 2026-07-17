import { type ButtonStateKey, type UINode } from "@pixi-ui-editor/schema";
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
  private readonly stateViews: Container[] = [];
  private readonly interaction: SceneInteractionMode;
  private enabledState: boolean;

  constructor(node: ButtonNode, textures: ReadonlyMap<string, Texture> | undefined, interaction: SceneInteractionMode) {
    super();
    this.interaction = interaction;
    const normalTexture = textures?.get(node.states.normalAssetId);
    const viewFor = (assetId: string | undefined): Container => {
      const texture = (assetId === undefined ? undefined : textures?.get(assetId)) ?? normalTexture;
      const view = texture === undefined ? new Graphics() : new Sprite(texture);
      this.stateViews.push(view);
      return view;
    };

    this.button = new FancyButton({
      defaultView: viewFor(node.states.normalAssetId),
      hoverView: viewFor(node.states.hoverAssetId),
      pressedView: viewFor(node.states.pressedAssetId),
      disabledView: viewFor(node.states.disabledAssetId),
    });
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
    for (const view of this.stateViews) {
      if (view instanceof Sprite) view.setSize(transform.width, transform.height);
      else if (view instanceof Graphics) view.clear().rect(0, 0, transform.width, transform.height).fill(0x4a5568).stroke({ width: 1, color: 0x94a3b8 });
    }
    // Только на изменение документа: иначе любой пересчёт layout сбрасывал бы transient preview state.
    if (node.type === "button" && node.enabled !== this.enabledState) this.applyEnabled(node.enabled);
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
