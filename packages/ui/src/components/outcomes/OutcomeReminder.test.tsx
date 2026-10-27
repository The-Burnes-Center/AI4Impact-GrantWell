import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { renderApp } from "../../test/render";
import OutcomeReminder from "./OutcomeReminder";
import type { DueApplication } from "../../common/api-client/outcomes-client";

const DUE = "GET /application-outcomes/due";
const SNOOZE = "POST /application-outcomes/snooze";
const TITLE = "What happened with your applications?";

const due: DueApplication[] = [
  { sessionId: "a", title: "Fiber plan", grant: "Broadband", deadline: "2026-09-30", status: null, submittedDate: null },
  { sessionId: "b", title: "Transit study", grant: "Rural Transit", deadline: null, status: "submitted", submittedDate: "2026-08-01" },
];

function renderReminder(list = due) {
  const onDone = vi.fn();
  const net = stubFetch({
    [DUE]: json({ due: list }),
    [SNOOZE]: json({ snoozedUntil: "2026-12-26T00:00:00.000Z" }),
    "PUT /application-outcomes/a": (req) => json({ sessionId: "a", ...(req.body as object) }),
    "PUT /application-outcomes/b": (req) => json({ sessionId: "b", ...(req.body as object) }),
  });
  return { net, onDone, ...renderApp(<OutcomeReminder onDone={onDone} />) };
}

describe("OutcomeReminder", () => {
  it("shows nothing and finishes when nothing is due", async () => {
    const { onDone } = renderReminder([]);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
  });

  it("saves what was answered and snoozes the rest, including an unchanged Submitted", async () => {
    const { net, onDone, user } = renderReminder();
    const dialog = await screen.findByRole("dialog", { name: TITLE });
    expect(dialog).toHaveTextContent("Deadline Sep 30, 2026");
    // The focus trap moves focus into the dialog 100 ms after it opens; typing before then loses keys.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.selectOptions(screen.getAllByLabelText("Outcome")[0], "awarded");
    // jsdom ignores typing into date inputs.
    fireEvent.change(screen.getByLabelText("Decision date"), { target: { value: "2026-10-10" } });
    await user.type(screen.getByLabelText("Amount awarded (whole dollars)"), "40,000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(net.last("PUT /application-outcomes/a").body).toEqual({ status: "awarded", decisionDate: "2026-10-10", amountAwarded: 40000 });
    expect(net.to("PUT /application-outcomes/b")).toHaveLength(0);
    expect(net.last(SNOOZE).body).toEqual({ sessionIds: ["b"] });
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
  });

  it("keeps the dialog open and saves nothing when an answer is incomplete", async () => {
    const { net, user } = renderReminder();
    await screen.findByRole("dialog", { name: TITLE });
    await user.selectOptions(screen.getAllByLabelText("Outcome")[0], "not_awarded");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Fiber plan: Decision date is required.");
    expect(net.to(SNOOZE)).toHaveLength(0);
  });

  it("snoozes every application on Not now", async () => {
    const { net, onDone, user } = renderReminder();
    await screen.findByRole("dialog", { name: TITLE });
    await user.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(net.last(SNOOZE).body).toEqual({ sessionIds: ["a", "b"] });
  });
});
