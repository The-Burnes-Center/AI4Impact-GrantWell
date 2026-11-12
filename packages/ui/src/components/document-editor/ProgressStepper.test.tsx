import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ProgressStepper from "./ProgressStepper";

const STEPS = [
  { id: "a", label: "Basics", tooltip: "Enter the basics." },
  { id: "b", label: "Questions", tooltip: "Answer questions." },
  { id: "c", label: "Review", tooltip: "Check everything." },
];

function renderStepper(onStepClick = vi.fn()) {
  const user = userEvent.setup();
  render(
    <ProgressStepper
      steps={STEPS}
      activeStep={0}
      completedSteps={[0, 1]}
      isStepClickable={(idx) => idx <= 1}
      onStepClick={onStepClick}
    />
  );
  return { user, onStepClick };
}

describe("ProgressStepper", () => {
  it("lists the steps with each one's state, including steps finished after the current one", () => {
    renderStepper();
    const nav = screen.getByRole("navigation", { name: "Application steps" });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole("button")).toHaveAccessibleName("Step 1 of 3: Basics, current step, completed");
    expect(within(items[1]).getByRole("button")).toHaveAccessibleName("Step 2 of 3: Questions, completed");
    expect(within(items[2]).getByRole("button")).toHaveAccessibleName("Step 3 of 3: Review, locked");
  });

  it("keeps a locked step focusable with its tooltip, and ignores clicks on it", async () => {
    const { user, onStepClick } = renderStepper();
    const locked = screen.getByRole("button", { name: /Review, locked/ });
    expect(locked).toBeEnabled();
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).toHaveAccessibleDescription("Check everything.");

    await user.tab();
    await user.tab();
    await user.tab();
    expect(locked).toHaveFocus();
    await user.click(locked);
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it("closes a hover tooltip with Escape while focus is elsewhere", async () => {
    const { user } = renderStepper();
    const tooltip = document.getElementById("tooltip-b")!;
    await user.hover(screen.getByRole("button", { name: /Questions/ }));
    expect(tooltip).toHaveClass("step-tooltip--visible");

    await user.keyboard("{Escape}");
    expect(tooltip).not.toHaveClass("step-tooltip--visible");
  });
});

describe("ProgressStepper all-steps list", () => {
  it("names every step with its state and help text for phones, where names and tooltips are hidden", async () => {
    const user = userEvent.setup();
    render(
      <ProgressStepper
        steps={STEPS}
        activeStep={1}
        completedSteps={[0]}
        isStepClickable={(idx) => idx <= 1}
        onStepClick={vi.fn()}
      />
    );
    const toggle = screen.getByText("All steps");
    await user.click(toggle);
    const list = toggle.closest("details")!;
    expect(list).toHaveAttribute("open");
    expect(within(list).getAllByRole("listitem", { hidden: true }).map((li) => li.textContent)).toEqual([
      "1 BasicsDoneEnter the basics.",
      "2 QuestionsYou are hereAnswer questions.",
      "3 ReviewLockedCheck everything.",
    ]);
  });

  it("unpins the stepper while the list is open, and closes the list on a step change", async () => {
    const user = userEvent.setup();
    const props = { steps: STEPS, completedSteps: [0], isStepClickable: (idx: number) => idx <= 1, onStepClick: vi.fn() };
    const { rerender } = render(<ProgressStepper {...props} activeStep={0} />);
    const nav = screen.getByRole("navigation", { name: "Application steps" });
    const list = screen.getByText("All steps").closest("details")!;
    expect(nav).toHaveStyle({ position: "sticky" });
    expect(nav).not.toHaveClass("progress-stepper-container--list-open");

    await user.click(screen.getByText("All steps"));
    expect(list).toHaveAttribute("open");
    expect(nav).toHaveClass("progress-stepper-container--list-open");
    expect(nav.querySelector("style")!.textContent).toMatch(
      /@media \(max-width: 768px\)[\s\S]*\.progress-stepper-container\.progress-stepper-container--list-open,\s*\.document-editor-header:has\(\+ \.progress-stepper-container--list-open\) \{\s*position: static !important;/
    );

    rerender(<ProgressStepper {...props} activeStep={1} />);
    expect(list).not.toHaveAttribute("open");
    expect(nav).not.toHaveClass("progress-stepper-container--list-open");
  });

  describe.each([
    [false, "smooth"],
    [true, "auto"],
  ])("on a phone, with reduced motion %s", (reduce, behavior) => {
    it(`scrolls the opened list's summary into view (${behavior})`, async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: query === "(max-width: 768px)" || (reduce && query === "(prefers-reduced-motion: reduce)"),
      }));
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      const { user } = renderStepper();
      const summary = screen.getByText("All steps");

      await user.click(summary);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(summary);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior });

      await user.click(summary);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    });
  });

  it("leaves the scroll alone on a wide screen", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { user } = renderStepper();
    await user.click(screen.getByText("All steps"));
    expect(scrollIntoView).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
