import { createProgram } from "./compile";
import { fillVertexShader, fillFragmentShader } from "./fill";
import { strokeVertexShader, strokeFragmentShader } from "./stroke";

export interface FillProgramInfo {
  program: WebGLProgram;
  uniforms: {
    matrix: WebGLUniformLocation;
    color: WebGLUniformLocation;
  };
  attribs: {
    position: number;
  };
}

export interface StrokeProgramInfo {
  program: WebGLProgram;
  uniforms: {
    matrix: WebGLUniformLocation;
    color: WebGLUniformLocation;
    halfWidth: WebGLUniformLocation;
    viewport: WebGLUniformLocation;
  };
  attribs: {
    position: number;
    normal: number;
    side: number;
  };
}

export function createFillProgramInfo(
  gl: WebGL2RenderingContext
): FillProgramInfo {
  const program = createProgram(gl, fillVertexShader, fillFragmentShader);

  return {
    program,
    uniforms: {
      matrix: gl.getUniformLocation(program, "u_matrix")!,
      color: gl.getUniformLocation(program, "u_color")!,
    },
    attribs: {
      position: gl.getAttribLocation(program, "a_position"),
    },
  };
}

export function createStrokeProgramInfo(
  gl: WebGL2RenderingContext
): StrokeProgramInfo {
  const program = createProgram(gl, strokeVertexShader, strokeFragmentShader);

  return {
    program,
    uniforms: {
      matrix: gl.getUniformLocation(program, "u_matrix")!,
      color: gl.getUniformLocation(program, "u_color")!,
      halfWidth: gl.getUniformLocation(program, "u_halfWidth")!,
      viewport: gl.getUniformLocation(program, "u_viewport")!,
    },
    attribs: {
      position: gl.getAttribLocation(program, "a_position"),
      normal: gl.getAttribLocation(program, "a_normal"),
      side: gl.getAttribLocation(program, "a_side"),
    },
  };
}
