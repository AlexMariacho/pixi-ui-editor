import { Spine, type SkeletonData } from "@esotericsoftware/spine-pixi-v8";
import { type UINode } from "@pixi-ui-editor/schema";
import { Graphics } from "pixi.js";
import { fitSpineToTransform } from "../layout.js";
import { NodeView } from "./NodeView.js";

export class SpineNodeView extends NodeView {
  constructor(skeletonData: SkeletonData | undefined, animation: string | undefined, loop: boolean) {
    super();
    if (skeletonData === undefined) {
      this.setContent(new Graphics());
      return;
    }
    const spine = new Spine(skeletonData);
    if (animation !== undefined && skeletonData.findAnimation(animation) !== null) spine.state.setAnimation(0, animation, loop);
    this.setContent(spine);
  }

  protected syncContent(_node: UINode, transform: UINode["transform"]): void {
    if (this.content instanceof Spine) {
      const fit = fitSpineToTransform(this.content.skeleton.data, transform);
      if (fit !== undefined) {
        this.content.scale.set(fit.scaleX, fit.scaleY);
        this.content.position.set(fit.x, fit.y);
      }
    } else if (this.content instanceof Graphics) {
      this.content.clear().rect(0, 0, transform.width, transform.height).fill(0xff00ff);
    }
  }
}
