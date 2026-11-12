import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import TurnstileWidget from "./TurnstileWidget";

vi.mock("./turnstile-config", () => ({ TURNSTILE_SITE_KEY: "test-site-key" }));

type RenderOptions = { callback: (token: string) => void; "error-callback": () => void };

afterEach(() => {
  delete (window as { turnstile?: unknown }).turnstile;
  vi.restoreAllMocks();
});

function stubTurnstile() {
  const render = vi.fn<(el: HTMLElement, options: object) => string>(() => "widget-1");
  (window as { turnstile?: unknown }).turnstile = { render, remove: vi.fn(), reset: vi.fn() };
  return render;
}

const stubWidth = (width: number) =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width } as DOMRect);

describe("TurnstileWidget", () => {
  it("asks for the compact challenge when the 300px one would not fit", async () => {
    const renderWidget = stubTurnstile();
    stubWidth(218);
    render(<TurnstileWidget action="sign-in" onToken={vi.fn()} resetKey={0} />);
    await waitFor(() => expect(renderWidget).toHaveBeenCalled());
    expect(renderWidget.mock.calls[0][1]).toMatchObject({ size: "compact" });
  });

  it("leaves the default size when the challenge fits", async () => {
    const renderWidget = stubTurnstile();
    stubWidth(360);
    render(<TurnstileWidget action="sign-in" onToken={vi.fn()} resetKey={0} />);
    await waitFor(() => expect(renderWidget).toHaveBeenCalled());
    expect(renderWidget.mock.calls[0][1]).not.toHaveProperty("size");
  });

  it("keeps focus in place when Try the check again removes itself", async () => {
    const renders: RenderOptions[] = [];
    (window as { turnstile?: unknown }).turnstile = {
      render: vi.fn((_el: HTMLElement, options: RenderOptions) => {
        renders.push(options);
        return `widget-${renders.length}`;
      }),
      remove: vi.fn(),
      reset: vi.fn(),
    };
    const onToken = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<TurnstileWidget action="sign-in" onToken={onToken} resetKey={0} />);

    await waitFor(() => expect(renders).toHaveLength(1));
    renders[0]["error-callback"]();
    const retry = await screen.findByRole("button", { name: "Try the check again" });

    await user.click(retry);
    expect(container.querySelector(".turnstile-field")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Try the check again" })).toBeNull();
    expect(screen.getByText("Running the security check again…")).toBeInTheDocument();

    await waitFor(() => expect(renders).toHaveLength(2));
    renders[1].callback("token-2");
    expect(onToken).toHaveBeenLastCalledWith("token-2");
    await waitFor(() => expect(screen.queryByText("Running the security check again…")).toBeNull());
  });
});
