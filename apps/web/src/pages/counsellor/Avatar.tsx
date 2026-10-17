import { useEffect, useRef, useState } from "react";
import type { VoiceState } from "./voice.js";
export type AvatarState = VoiceState | "thinking";

/** A real depth-tested 3D mesh, rendered locally without a provider or downloaded model. */
export function Avatar({ state }: { state: AvatarState }): React.ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef(state); current.current = state;
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const element = canvas.current;
    let context: WebGLRenderingContext | null | undefined;
    try { context = element?.getContext("webgl", { alpha: true, antialias: true }); }
    catch { setUnavailable(true); return; }
    const gl = context;
    if (!element || !gl) { setUnavailable(true); return; }
    const vertex = gl.createShader(gl.VERTEX_SHADER);
    const fragment = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment); if (program) gl.deleteProgram(program);
      setUnavailable(true); return;
    }
    gl.shaderSource(vertex, `attribute vec3 p; uniform vec3 scale; uniform vec3 shift; uniform float angle; varying vec3 normal;
      void main(){float c=cos(angle),s=sin(angle);vec3 v=p*scale+shift;v=vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);
      normal=normalize(vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z));gl_Position=vec4(v.x/1.7,v.y/2.0,-v.z/8.0,1.0);}`);
    gl.shaderSource(fragment, `precision mediump float; uniform vec3 color; varying vec3 normal;
      void main(){float light=0.35+0.65*max(dot(normalize(normal),normalize(vec3(-0.6,0.8,1.0))),0.0);gl_FragColor=vec4(color*light,1.0);}`);
    gl.compileShader(vertex); gl.compileShader(fragment); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getShaderParameter(vertex, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragment, gl.COMPILE_STATUS) || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setUnavailable(true); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); return;
    }
    const vertices: number[] = [];
    const point = (latitude: number, longitude: number): number[] => [Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude)];
    for (let row = 0; row < 16; row++) for (let column = 0; column < 24; column++) {
      const a = row * Math.PI / 16, b = (row + 1) * Math.PI / 16, c = column * Math.PI * 2 / 24, d = (column + 1) * Math.PI * 2 / 24;
      vertices.push(...point(a, c), ...point(b, c), ...point(b, d), ...point(a, c), ...point(b, d), ...point(a, d));
    }
    const buffer = gl.createBuffer();
    if (!buffer) { setUnavailable(true); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "p"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    const scale = gl.getUniformLocation(program, "scale"), shift = gl.getUniformLocation(program, "shift"), color = gl.getUniformLocation(program, "color"), angle = gl.getUniformLocation(program, "angle");
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function mesh(size: number[], offset: number[], shade: number[]): void {
      gl!.uniform3fv(scale, size); gl!.uniform3fv(shift, offset); gl!.uniform3fv(color, shade); gl!.drawArrays(gl!.TRIANGLES, 0, vertices.length / 3);
    }
    function render(time: number): void {
      gl!.viewport(0, 0, element!.width, element!.height); gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
      const motion = reducedMotion?.matches ? 0 : Math.sin(time / 1700) * 0.12;
      gl!.uniform1f(angle, motion);
      const shade = current.current === "error" ? [0.7, 0.25, 0.3] : current.current === "listening" ? [0.2, 0.6, 0.4]
        : current.current === "thinking" ? [0.75, 0.55, 0.15] : current.current === "speaking" ? [0.35, 0.5, 0.8] : [0.15, 0.45, 0.6];
      mesh([1.2, 0.7, 0.45], [0, -1.1, 0], shade);
      mesh([0.25, 0.4, 0.3], [0, -0.5, 0], [0.83, 0.59, 0.42]);
      mesh([0.65, 0.85, 0.58], [0, 0.45, 0], [0.92, 0.69, 0.49]);
      mesh([0.67, 0.35, 0.59], [0, 1.1, -0.07], [0.2, 0.14, 0.12]);
      for (const x of [-0.27, 0.27]) {
        mesh([0.14, 0.085, 0.075], [x, 0.63, 0.55], [1, 0.96, 0.89]);
        mesh([0.045, 0.05, 0.035], [x, 0.63, 0.62], [0.13, 0.18, 0.19]);
      }
      mesh([0.09, 0.17, 0.13], [0, 0.42, 0.59], [0.88, 0.62, 0.44]);
      const jaw = current.current === "speaking" && !reducedMotion?.matches ? Math.abs(Math.sin(time / 85)) * 0.1 : 0;
      mesh([0.3, 0.21, 0.21], [0, 0.03 - jaw, 0.37], [0.92, 0.69, 0.49]);
      mesh([0.22, 0.025 + jaw, 0.035], [0, 0.14 - jaw / 2, 0.57], [0.35, 0.12, 0.13]);
      frame = requestAnimationFrame(render);
    }
    const lost = (event: Event): void => { event.preventDefault(); cancelAnimationFrame(frame); setUnavailable(true); };
    element.addEventListener("webglcontextlost", lost); frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); element.removeEventListener("webglcontextlost", lost); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); };
  }, []);
  return <figure style={{ margin: 0, textAlign: "center" }}>
    <canvas ref={canvas} width={340} height={400} role="img" aria-label={`3D counsellor avatar: ${state}`} style={{ width: "min(100%, 340px)", height: "auto", display: unavailable ? "none" : "inline-block" }} />
    {unavailable && <p>3D rendering is unavailable in this browser. Voice and typed questions remain available.</p>}
    <figcaption aria-live="polite">{state === "idle" ? "Ready for your question" : state === "thinking" ? "Finding an answer" : state === "listening" ? "Listening to your question" : state === "speaking" ? "Speaking the answer" : "Needs your attention"}</figcaption>
  </figure>;
}
