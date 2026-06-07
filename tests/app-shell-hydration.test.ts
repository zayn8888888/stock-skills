import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => undefined,
}));

vi.mock("@/components/layout/ConnectionBanner", () => ({
  ConnectionBanner: () => null,
}));

vi.mock("@/components/layout/Sidebar", () => ({
  Sidebar: ({ collapsed }: { collapsed: boolean }) =>
    React.createElement("div", { "data-collapsed": String(collapsed) }),
}));

import { AppShell } from "@/components/layout/AppShell";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppShell hydration", () => {
  it("renders the same initial sidebar state on the server and client", () => {
    vi.stubGlobal("React", React);
    const children = React.createElement("div", null, "content");
    const serverHtml = renderToString(React.createElement(AppShell, null, children));

    vi.stubGlobal("window", { innerWidth: 390 });
    vi.stubGlobal("localStorage", {
      getItem: () => "true",
      setItem: () => undefined,
    });

    const clientHtml = renderToString(React.createElement(AppShell, null, children));

    expect(clientHtml).toBe(serverHtml);
  });
});
