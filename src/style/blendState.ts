import { setBlendMode } from "./blendMode";
import type { BlendMode } from "./types";

export class BlendState {
  private gl: WebGL2RenderingContext;
  private enabled = false;
  private currentMode: BlendMode | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  enable(mode?: BlendMode): void {
    if (!this.enabled) {
      this.gl.enable(this.gl.BLEND);
      this.enabled = true;
    }
    if (mode) {
      this.setMode(mode);
    }
  }

  setMode(mode: BlendMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    setBlendMode(this.gl, mode);
  }

  disable(): void {
    if (!this.enabled) return;
    this.gl.disable(this.gl.BLEND);
    this.enabled = false;
    this.currentMode = null;
  }

  get mode(): BlendMode | null {
    return this.currentMode;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}
