"use client";

import * as React from "react";
import { FlexGrid, FlexGridColumn, FlexGridCellTemplate } from "@grapecity/wijmo.react.grid";
import * as wjGrid from "@grapecity/wijmo.grid";
import { Button } from "@/components/ui/button";
import '@grapecity/wijmo.styles/wijmo.css';
import styles from './DataGrid.module.scss';
import { Barcode, Edit, Search, Trash2 } from "lucide-react";
import { ref } from "process";
interface Column {
    name: string;
    header: string;
    width?: number | string;
    minWidth?: number;
    visible?: boolean;
    isRequired?: boolean;
    isReadOnly?: boolean;
    dataType?: string | number;
    format?: string;
    editor?: any;
    align?: "left" | "right" | "center";
    maxLength?: number;
    isContentHtml?: boolean;
    cellTemplateType?: "button" | "status" | "custom";
    onClick?: (item: any) => void;
    body?: (cell: any) => JSX.Element;
    buttonBody?: "button" | string;
    className?: string;
    iconType?: string;
    title?: string;
    readonly?: boolean;
}

interface CustomFlexGridProps {
    dataSource: any[];
    scheme: { columns: Column[] };
    [key: string]: any;
    allowDragging?: "Rows" | "Columns" | "Both";
    isReport?: boolean;
    headersVisibility?: "All" | "Column" | "Row" | "None";
    keyActionEnter?: string;
    allowMerging?: boolean;
    initialized?: (s: wjGrid.FlexGrid) => void;
    cellEditEnded?: (s: wjGrid.FlexGrid, e: wjGrid.CellRangeEventArgs) => void;
    cellEditStarting?: (s: wjGrid.FlexGrid, e: wjGrid.CellRangeEventArgs) => void;
    beginningEdit?: (s: wjGrid.FlexGrid, e: wjGrid.CellRangeEventArgs) => void;
    selectionChanged?: (s: wjGrid.FlexGrid, e: wjGrid.CellRangeEventArgs) => void;
    onRowDoubleClick?: (item: any) => void;
}

export default function CustomFlexGrid({
    dataSource,
    scheme,
    allowDragging,
    isReport,
    headersVisibility,
    initialized,
    cellEditEnded,
    cellEditStarting,
    beginningEdit,
    selectionChanged,
    onRowDoubleClick,
    ref: forwardedRef
}: CustomFlexGridProps) {

    const flexRef = React.useRef<wjGrid.FlexGrid | null>(null);

    React.useImperativeHandle(forwardedRef, () => flexRef.current, []);


    const handleInitialized = (grid: wjGrid.FlexGrid) => {
        flexRef.current = grid; // ✅ works now
        console.log("flexRef.current ",flexRef.current)
        initialized;

        if (onRowDoubleClick) {
            grid.hostElement.addEventListener("dblclick", (e: MouseEvent) => {
                const ht = grid.hitTest(e);
                if (ht.row < 0) return;
                const item = grid.rows[ht.row].dataItem;
                if (item) onRowDoubleClick(item);
            });
        }
    };

    return (
        <div className={styles.customFlexgrid}>
            <FlexGrid
                ref={flexRef}
                itemsSource={dataSource}
                headersVisibility={headersVisibility || "Column"}
                isReadOnly={isReport || false}
                wordWrap={true}
                showAlternatingRows={true}
                allowDragging={allowDragging || "None"}
                cssClass={styles.customFlexgrid}
                allowResizing="Both"
                initialized={handleInitialized}
                cellEditEnded={cellEditEnded}
                cellEditStarting={cellEditStarting}
                beginningEdit={beginningEdit}
                selectionChanged={selectionChanged}
                onRowDoubleClick={onRowDoubleClick}
            >
                {/* Optional row headers for numbering */}
                {allowDragging && (allowDragging === "Rows" || allowDragging === "Both") && (
                    <FlexGridCellTemplate
                        cellType="RowHeader"
                        template={(cell) => <span>{cell.row.index + 1}</span>}
                    />
                )}

                {/* Columns */}
                {scheme.columns.map((col, idx) => (
                    <FlexGridColumn
                        key={idx}
                        name={col.name}
                        header={col.header}
                        binding={col.name}
                        width={col.width}
                        minWidth={col.minWidth}
                        visible={col.visible !== false}
                        align={col.align || "left"}
                        multiLine={true}
                        maxLength={col.maxLength}
                        isContentHtml={col.isContentHtml}
                        isReadOnly={col.isReadOnly || col.buttonBody === "button"}
                    >
                        {/* Dropdown editor for unit_name */}
                        {col.editor && (
                            <FlexGridCellTemplate
                                cellType="Cell"
                                template={(cell) => {
                                    // editor should be a function that returns JSX, NOT DOM element
                                    return col.editor(cell);
                                }}
                            />
                        )}
                        {/* Button column */}
                        {col.buttonBody === "button" && (
                            <FlexGridCellTemplate
                                cellType="Cell"
                                template={(cell) => (
                                    <button
                                        className={`wj-btn flex items-center justify-center gap-1 rounded-md px-2 py-1 hover:bg-gray-100`}
                                        title={col.title || col.header}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            col.onClick?.(cell.row.dataItem);
                                        }}
                                    >
                                        {col.iconType === "edit" ? (
                                            <Edit className="w-4 h-4 text-green-600" />
                                        ) : col.iconType === "trash" ? (
                                            <Trash2 className="w-4 h-4 text-red-600" />
                                        ) : col.iconType === "barcode" ? (
                                            <Barcode className="w-4 h-4 text-blue-600" />
                                        ) : col.iconType === "search" ? (
                                            <Search className="w-4 h-4 text-black-900" />
                                        )
                                            : (
                                                col.header
                                            )}
                                    </button>
                                )}
                            />
                        )}

                        {col.name === "status" && !col.body && (
                            <FlexGridCellTemplate
                                cellType="Cell"
                                template={(cell) => (
                                    <span
                                        className={
                                            cell.row.dataItem.status === "Active" ? "status-active" : "status-inactive"
                                        }
                                    >
                                        {cell.row.dataItem.status}
                                    </span>
                                )}
                            />
                        )}
                    </FlexGridColumn>
                ))}
            </FlexGrid>
        </div>
    );
}
