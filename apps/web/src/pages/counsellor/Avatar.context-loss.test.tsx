import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Avatar } from "./Avatar.js";

// Synthetic lifecycle coverage only: the real component consumes a typed GL/scheduler
// fixture. Draw observations below do not establish successful hardware GPU rendering.
type GLMethods = "createShader" | "createProgram" | "shaderSource" | "compileShader" | "attachShader" | "linkProgram"
  | "getShaderParameter" | "getProgramParameter" | "createBuffer" | "bindBuffer" | "bufferData" | "useProgram"
  | "getAttribLocation" | "enableVertexAttribArray" | "vertexAttribPointer" | "getUniformLocation" | "enable"
  | "clearColor" | "viewport" | "clear" | "uniform1f" | "uniform3fv" | "drawArrays" | "deleteShader" | "deleteProgram" | "deleteBuffer";
type GLConstants = "VERTEX_SHADER" | "FRAGMENT_SHADER" | "COMPILE_STATUS" | "LINK_STATUS" | "ARRAY_BUFFER" | "STATIC_DRAW"
  | "FLOAT" | "DEPTH_TEST" | "COLOR_BUFFER_BIT" | "DEPTH_BUFFER_BIT" | "TRIANGLES";
// This partial synthetic model admits allocation refusal without claiming that it
// implements every field of a native WebGL context.
type ProbeGL = Omit<Pick<WebGLRenderingContext, GLMethods | GLConstants>, "createProgram" | "createBuffer"> & {
  createProgram: () => WebGLProgram | null;
  createBuffer: () => WebGLBuffer | null;
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test("context loss after initialized Avatar retires rendering and cleans resources on unmount", () => {
  const vertex: WebGLShader = {}, fragment: WebGLShader = {}, program: WebGLProgram = {}, buffer: WebGLBuffer = {}, uniform: WebGLUniformLocation = {};
  const gl = {
    VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
    ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88E4, FLOAT: 0x1406, DEPTH_TEST: 0x0B71,
    COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100, TRIANGLES: 0x0004,
    createShader: vi.fn((kind: number): WebGLShader | null => kind === 0x8B31 ? vertex : fragment),
    createProgram: vi.fn((): WebGLProgram | null => program), createBuffer: vi.fn((): WebGLBuffer | null => buffer),
    shaderSource: vi.fn<WebGLRenderingContext["shaderSource"]>(), compileShader: vi.fn<WebGLRenderingContext["compileShader"]>(),
    attachShader: vi.fn<WebGLRenderingContext["attachShader"]>(), linkProgram: vi.fn<WebGLRenderingContext["linkProgram"]>(),
    getShaderParameter: vi.fn((): boolean => true), getProgramParameter: vi.fn((): boolean => true),
    bindBuffer: vi.fn<WebGLRenderingContext["bindBuffer"]>(),
    bufferData: vi.fn((_target: number, _data: number | AllowSharedBufferSource | null, _usage: number): void => {}),
    useProgram: vi.fn<WebGLRenderingContext["useProgram"]>(), getAttribLocation: vi.fn((): number => 0),
    enableVertexAttribArray: vi.fn<WebGLRenderingContext["enableVertexAttribArray"]>(),
    vertexAttribPointer: vi.fn<WebGLRenderingContext["vertexAttribPointer"]>(), getUniformLocation: vi.fn((): WebGLUniformLocation | null => uniform),
    enable: vi.fn<WebGLRenderingContext["enable"]>(), clearColor: vi.fn<WebGLRenderingContext["clearColor"]>(),
    viewport: vi.fn<WebGLRenderingContext["viewport"]>(), clear: vi.fn<WebGLRenderingContext["clear"]>(),
    uniform1f: vi.fn<WebGLRenderingContext["uniform1f"]>(), uniform3fv: vi.fn<WebGLRenderingContext["uniform3fv"]>(),
    drawArrays: vi.fn<WebGLRenderingContext["drawArrays"]>(), deleteShader: vi.fn<WebGLRenderingContext["deleteShader"]>(),
    deleteProgram: vi.fn<WebGLRenderingContext["deleteProgram"]>(), deleteBuffer: vi.fn<WebGLRenderingContext["deleteBuffer"]>(),
  } satisfies ProbeGL;
  // This interface adaptation supplies only the native methods consumed by Avatar;
  // it does not replace Avatar or create a native browser/GPU context.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as unknown as WebGLRenderingContext);
  const addListener = vi.spyOn(HTMLCanvasElement.prototype, "addEventListener");
  const removeListener = vi.spyOn(HTMLCanvasElement.prototype, "removeEventListener");
  const scheduled = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  const request = vi.fn<typeof requestAnimationFrame>((callback) => { const id = ++nextId; scheduled.set(id, callback); return id; });
  const cancel = vi.fn<typeof cancelAnimationFrame>((id) => { scheduled.delete(id); });
  vi.stubGlobal("requestAnimationFrame", request); vi.stubGlobal("cancelAnimationFrame", cancel);
  function drain(time: number): void {
    // A canceled entry is removed and is not executed as a normal browser frame.
    for (const [id, callback] of [...scheduled]) { scheduled.delete(id); callback(time); }
  }
  const view = render(<Avatar state="speaking" />);
  const canvas = screen.getByRole("img", { name: "3D counsellor avatar: speaking" });
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Avatar did not create its canvas");
  expect(scheduled.size).toBe(1); act(() => drain(100));
  expect(gl.drawArrays.mock.calls.length).toBeGreaterThan(0);
  expect(scheduled.size).toBe(1);
  const pendingId = [...scheduled.keys()][0];
  if (pendingId === undefined) throw new Error("Fixture did not schedule the next frame");
  const registration = addListener.mock.calls.find(([kind]) => kind === "webglcontextlost");
  if (!registration) throw new Error("Avatar did not register its context-loss listener");
  const drawsBeforeLoss = gl.drawArrays.mock.calls.length, requestsBeforeLoss = request.mock.calls.length;
  const lost = new Event("webglcontextlost", { cancelable: true });
  act(() => { canvas.dispatchEvent(lost); });
  expect(lost.defaultPrevented).toBe(true); expect(cancel).toHaveBeenCalledWith(pendingId);
  expect(screen.getByText(/3D rendering is unavailable/)).toBeInTheDocument();
  expect(screen.getByText("Speaking the answer")).toBeInTheDocument(); expect(canvas).not.toBeVisible();
  expect(scheduled.size).toBe(0); act(() => drain(200));
  expect(gl.drawArrays.mock.calls.length).toBe(drawsBeforeLoss); expect(request.mock.calls.length).toBe(requestsBeforeLoss);
  const cancellationsBeforeUnmount = cancel.mock.calls.length;
  view.unmount();
  expect(cancel).toHaveBeenCalledTimes(cancellationsBeforeUnmount + 1); expect(cancel).toHaveBeenLastCalledWith(pendingId);
  expect(removeListener).toHaveBeenCalledWith("webglcontextlost", registration[1]);
  expect(gl.deleteBuffer).toHaveBeenCalledWith(buffer); expect(gl.deleteProgram).toHaveBeenCalledWith(program);
  expect(gl.deleteShader).toHaveBeenCalledWith(vertex); expect(gl.deleteShader).toHaveBeenCalledWith(fragment);
  expect(gl.deleteShader).toHaveBeenCalledTimes(2); expect(scheduled.size).toBe(0);
  const detachedLoss = new Event("webglcontextlost", { cancelable: true }); canvas.dispatchEvent(detachedLoss);
  expect(detachedLoss.defaultPrevented).toBe(false); drain(300);
  expect(gl.drawArrays.mock.calls.length).toBe(drawsBeforeLoss); expect(request.mock.calls.length).toBe(requestsBeforeLoss);
});
