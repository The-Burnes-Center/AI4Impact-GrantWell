import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  NotificationProvider,
  useNotifications,
} from "../../src/components/notifications/NotificationManager";
import NotificationBar from "../../src/components/notifications/NotificationBar";
import { axe } from "./axe";

vi.mock("../../src/pages/home/HomePage", async () => {
  const { useNotifications: use } = await import(
    "../../src/components/notifications/NotificationManager"
  );
  return {
    default: function MockHomePage() {
      const { addNotification } = use();
      return (
        <div>
          <button type="button" onClick={() => addNotification("error", "Upload failed")}>
            emit error
          </button>
          <button type="button" onClick={() => addNotification("success", "Draft saved")}>
            emit success
          </button>
        </div>
      );
    },
  };
});

function Emitter({ type, content }: { type: string; content: string }) {
  const { addNotification } = useNotifications();
  return (
    <button type="button" onClick={() => addNotification(type, content)}>
      emit
    </button>
  );
}

function renderBarWithEmitter(type: string, content: string) {
  return render(
    <NotificationProvider>
      <NotificationBar />
      <Emitter type={type} content={content} />
    </NotificationProvider>
  );
}

describe("NotificationBar live-region roles", () => {
  it.each([
    ["error", "alert"],
    ["warning", "alert"],
  ])("announces a %s notification with role=%s", async (type, role) => {
    const user = userEvent.setup();
    renderBarWithEmitter(type, `${type} happened`);

    expect(screen.queryByRole(role)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "emit" }));

    const region = await screen.findByRole(role);
    expect(region).toHaveTextContent(`${type} happened`);
  });

  it.each([
    ["info", "status"],
    ["success", "status"],
  ])("announces a %s notification with role=%s", async (type, role) => {
    const user = userEvent.setup();
    renderBarWithEmitter(type, `${type} happened`);

    await user.click(screen.getByRole("button", { name: "emit" }));

    const region = await screen.findByRole(role);
    expect(region).toHaveTextContent(`${type} happened`);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders one live region per notification and lets each be dismissed", async () => {
    const user = userEvent.setup();
    render(
      <NotificationProvider>
        <NotificationBar />
        <Emitter type="error" content="first failure" />
      </NotificationProvider>
    );

    const emit = screen.getByRole("button", { name: "emit" });
    await user.click(emit);
    await user.click(emit);
    expect(await screen.findAllByRole("alert")).toHaveLength(2);

    const dismiss = screen.getAllByRole("button", { name: /close/i });
    expect(dismiss).toHaveLength(2);
    await user.click(dismiss[0]);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("is axe-clean while a notification is on screen", async () => {
    const user = userEvent.setup();
    const { container } = renderBarWithEmitter("error", "Upload failed");
    await user.click(screen.getByRole("button", { name: "emit" }));
    await screen.findByRole("alert");

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("App notification wiring", () => {
  it("actually renders a toast raised from a page, not just stores it", async () => {
    const user = userEvent.setup();
    const { default: App } = await import("../../src/App");

    render(
      <MemoryRouter initialEntries={["/home"]}>
        <App />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("button", { name: "emit error" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Upload failed");
  });

  it("routes a success toast to role=status inside the real app tree", async () => {
    const user = userEvent.setup();
    const { default: App } = await import("../../src/App");

    render(
      <MemoryRouter initialEntries={["/home"]}>
        <App />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("button", { name: "emit success" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Draft saved");
  });
});
