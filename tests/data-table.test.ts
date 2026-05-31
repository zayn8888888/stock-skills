import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataTable } from "@/components/common/DataTable";

(
  globalThis as unknown as {
    React: typeof React;
  }
).React = React;

describe("DataTable", () => {
  it("does not show an impossible first page when empty", () => {
    const html = renderToStaticMarkup(
      createElement(DataTable<{ name: string }, unknown>, {
        columns: [{ accessorKey: "name", header: "Name" }],
        data: [],
      }),
    );

    expect(html).toContain("No data");
    expect(html).toContain("0 row(s) total");
    expect(html).toContain("Page 0 of 0");
    expect(html).not.toContain("Page 1 of 0");
  });
});
