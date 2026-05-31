"use client";

import { cn } from "@/lib/utils";
import {
  type ColumnDef,
  type PaginationState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, useState } from "react";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  className?: string;
  renderExpanded?: (row: TData) => React.ReactNode;
  getRowId?: (row: TData) => string;
  onRowClick?: (row: TData) => void;
  selectedRowId?: string | null;
  labels?: Partial<{
    noData: string;
    rowsTotal: (count: number) => string;
    previous: string;
    next: string;
    page: (current: number, total: number) => string;
  }>;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 10,
  className,
  renderExpanded,
  getRowId,
  onRowClick,
  selectedRowId,
  labels,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const pageCount = table.getPageCount();
  const currentPage = pageCount === 0 ? 0 : table.getState().pagination.pageIndex + 1;
  const totalRows = table.getFilteredRowModel().rows.length;
  const text = {
    noData: labels?.noData ?? "No data",
    rowsTotal: labels?.rowsTotal ?? ((count: number) => `${count} row(s) total`),
    previous: labels?.previous ?? "Previous",
    next: labels?.next ?? "Next",
    page: labels?.page ?? ((current: number, total: number) => `Page ${current} of ${total}`),
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    tabIndex={h.column.getCanSort() ? 0 : undefined}
                    className={cn(
                      "px-4 py-2.5 text-left font-medium text-muted-foreground select-none",
                      h.column.getCanSort() && "cursor-pointer hover:text-foreground",
                    )}
                    onClick={h.column.getToggleSortingHandler()}
                    onKeyDown={(event) => {
                      if (!h.column.getCanSort()) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      h.column.getToggleSortingHandler()?.(event);
                    }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc" && <ChevronUp className="h-3 w-3" />}
                      {h.column.getIsSorted() === "desc" && <ChevronDown className="h-3 w-3" />}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {text.noData}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const rowId = getRowId?.(row.original) ?? row.id;
                const isExpanded =
                  selectedRowId !== undefined
                    ? selectedRowId === rowId
                    : (expandedRows[rowId] ?? false);
                const canInteract = !!renderExpanded || !!onRowClick;
                return (
                  <Fragment key={rowId}>
                    <tr
                      tabIndex={canInteract ? 0 : undefined}
                      className={cn(
                        "border-t border-border hover:bg-muted/30 transition-colors",
                        canInteract && "cursor-pointer",
                        selectedRowId === rowId && "bg-primary/5",
                      )}
                      onClick={() => {
                        onRowClick?.(row.original);
                        if (renderExpanded) {
                          setExpandedRows((p) => ({ ...p, [rowId]: !p[rowId] }));
                        }
                      }}
                      onKeyDown={(event) => {
                        if (!canInteract) return;
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        onRowClick?.(row.original);
                        if (renderExpanded) {
                          setExpandedRows((p) => ({ ...p, [rowId]: !p[rowId] }));
                        }
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-2.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                    {renderExpanded && isExpanded && (
                      <tr key={`${rowId}-expanded`} className="border-t border-border bg-muted/10">
                        <td colSpan={row.getVisibleCells().length} className="px-4 py-3">
                          {renderExpanded(row.original)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
        <span>{text.rowsTotal(totalRows)}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted transition-colors"
          >
            {text.previous}
          </button>
          <span>{text.page(currentPage, pageCount)}</span>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted transition-colors"
          >
            {text.next}
          </button>
        </div>
      </div>
    </div>
  );
}
