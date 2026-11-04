"use client";

import { tr } from "@/lib/i18n"
import * as React from "react";
import ProductNumbers from "./ProductNumbers";
import { isScaleItemBarcode, SCALE_BARCODE_ERROR } from "@/lib/scale-barcode";

interface ProductBarcodesProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    unitName: string;
    barcodes: string[];
    reservedBarcodes?: string[];
    soldUsingScale?: boolean;
    onUpdateBarcodes: (newBarcodes: string[]) => void;
}

// نافذة باركودات الوحدة — نفس نافذة "الرقم الأصلي/رقم المصنع" (ProductNumbers): سطر إضافة سريع بالأعلى (Enter)
// وقائمة قابلة للتعديل والحذف. فحوص الباركود: باركود الميزان لصنف يُباع بالميزان، والتكرار داخل الوحدة
// (ضمن ProductNumbers) ومع وحدات الصنف الأخرى (reservedBarcodes).
export default function ProductBarcodes({
    open,
    onOpenChange,
    unitName,
    barcodes,
    reservedBarcodes = [],
    soldUsingScale = false,
    onUpdateBarcodes,
}: ProductBarcodesProps) {
    const validate = React.useCallback((value: string) => {
        if (soldUsingScale && !isScaleItemBarcode(value)) return SCALE_BARCODE_ERROR;
        const key = value.trim().toLocaleLowerCase("en");
        if (reservedBarcodes.some((reserved) => String(reserved ?? "").trim().toLocaleLowerCase("en") === key)) {
            return `الباركود ${value} مستخدم في وحدة أخرى من نفس الصنف`;
        }
        return "";
    }, [soldUsingScale, reservedBarcodes]);

    return (
        <ProductNumbers
            open={open}
            onOpenChange={onOpenChange}
            title={tr("الباركود")}
            subtitle={tr("{0} · يمكن إضافة أكثر من باركود", unitName ? `الوحدة: ${unitName}` : "الوحدة")}
            numbers={barcodes}
            onUpdateNumbers={onUpdateBarcodes}
            currentProductName={unitName}
            validate={validate}
        />
    );
}
