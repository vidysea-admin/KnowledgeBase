import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Avatar } from "./Avatar.js";
afterEach(() => vi.restoreAllMocks());
test("missing WebGL preserves labelled lifecycle and honest fallback", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  render(<Avatar state="listening" />);
  expect(screen.getByText(/3D rendering is unavailable/)).toBeInTheDocument();
  expect(screen.getByText("Listening to your question")).toBeInTheDocument();
});
test("blocked context creation is an honest fallback rather than a crashed page", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => { throw new Error("blocked"); });
  render(<Avatar state="thinking" />);
  expect(screen.getByText(/3D rendering is unavailable/)).toBeInTheDocument(); expect(screen.getByText("Finding an answer")).toBeInTheDocument();
});
test("failed GPU allocation cleans partial resources and preserves voice state", () => {
  const shader = {}, program = {}, gl: any = { VERTEX_SHADER: 1, FRAGMENT_SHADER: 2,
    createShader: vi.fn().mockReturnValueOnce(shader).mockReturnValueOnce(null), createProgram: vi.fn(() => program), deleteShader: vi.fn(), deleteProgram: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl);
  render(<Avatar state="speaking" />); expect(screen.getByText(/3D rendering is unavailable/)).toBeInTheDocument();
  expect(gl.deleteShader).toHaveBeenCalledWith(shader); expect(gl.deleteProgram).toHaveBeenCalledWith(program); expect(screen.getByText("Speaking the answer")).toBeInTheDocument();
});
