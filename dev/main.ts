import { VERSION } from "../src/index";

console.log(`Tessera v${VERSION}`);

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const gl = canvas.getContext("webgl2");

if (!gl) {
  throw new Error("WebGL2 not supported");
}

// Set canvas size to match display size
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  gl!.viewport(0, 0, canvas.width, canvas.height);
}

resize();
window.addEventListener("resize", resize);

// Clear to dark gray
gl.clearColor(0.1, 0.1, 0.1, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);

console.log("WebGL2 context initialized");
