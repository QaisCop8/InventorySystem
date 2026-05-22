"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OrderForReceived {
  id: number;
  order_number: string;
  received_by?: string;
}

interface ReceivedByPopupProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (orderValues: Record<number, string>) => void;
  orders?: OrderForReceived[]; // multiple orders
  defaultValue?: string; // single order (legacy)
}

const ReceivedByPopup: React.FC<ReceivedByPopupProps> = ({
  visible,
  onClose,
  onConfirm,
  orders = [],
  defaultValue = "",
}) => {
  const [isBatchMode, setIsBatchMode] = useState(orders.length > 1);
  const [copyToAllValue, setCopyToAllValue] = useState("");
  const [orderValues, setOrderValues] = useState<Record<number, string>>({});
  const copyToAllRef = useRef<HTMLInputElement>(null);
  const singleInputRef = useRef<HTMLInputElement>(null);
  const firstOrderInputRef = useRef<HTMLInputElement>(null);

  // Initialize orderValues from orders or defaultValue
  useEffect(() => {
    if (visible) {
      if (orders.length > 0) {
        setIsBatchMode(orders.length > 1);
        const values: Record<number, string> = {};
        orders.forEach((order) => {
          values[order.id] = order.received_by || "";
        });
        setOrderValues(values);
      } else if (defaultValue) {
        // Legacy single-order mode
        setIsBatchMode(false);
        setOrderValues({ 0: defaultValue });
      }
      setCopyToAllValue("");
    }
  }, [visible, orders, defaultValue]);

  // Keyboard shortcuts: F3 to save, Escape to cancel
  useEffect(() => {
    if (!visible) return;

    // Auto-focus based on mode
    if (isBatchMode && orders.length > 1) {
      // Batch mode: focus copy-to-all field
      setTimeout(() => copyToAllRef.current?.focus(), 0);
    } else if (orders.length === 1) {
      // Single mode: focus first order input field
      setTimeout(() => firstOrderInputRef.current?.focus(), 0);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F3" || e.code === "F3") {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, orderValues]);

  const handleConfirm = () => {
    //const hasAtLeastOne = Object.values(orderValues).some((v) => v.trim());
    //if (hasAtLeastOne) {
      onConfirm(orderValues);
      setOrderValues({});
      setCopyToAllValue("");
    //}
  };

  const handleCancel = () => {
    if (orders.length > 0) {
      const values: Record<number, string> = {};
      orders.forEach((order) => {
        values[order.id] = order.received_by || "";
      });
      setOrderValues(values);
    }
    setCopyToAllValue("");
    onClose();
  };

  const handleCopyToAll = () => {
    if (copyToAllValue.trim()) {
      const updated: Record<number, string> = {};
      Object.keys(orderValues).forEach((key) => {
        const orderId = parseInt(key);
        updated[orderId] = copyToAllValue.trim();
      });
      setOrderValues(updated);
      setCopyToAllValue("");
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-lg shadow-2xl border p-6 flex flex-col w-full max-w-2xl max-h-[80vh] overflow-y-auto"
        dir="rtl"
      >
        <h3 className="text-lg font-semibold mb-4 text-right">
          استلمت بواسطة
        </h3>

        {/* Batch mode: copy to all section */}
        {isBatchMode && orders.length > 1 && (
          <div className="mb-6 p-4 bg-blue-50 rounded border border-blue-200">
            <p className="text-sm font-medium text-blue-900 mb-3 text-right">
              انسخ القيمة إلى جميع الطلبيات المحددة
            </p>
            <div className="flex gap-2">
              <Input
                ref={copyToAllRef}
                type="text"
                placeholder="أدخل القيمة واضغظ انسخ الكل"
                value={copyToAllValue}
                onChange={(e) => setCopyToAllValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    //handleCopyToAll();
                  }
                }}
                className="flex-1 p-2 border border-gray-300 rounded text-right"
                maxLength={15}
              />
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 whitespace-nowrap"
                onClick={handleCopyToAll}
              >
                انسخ الكل
              </Button>
            </div>
          </div>
        )}

        {/* Individual order fields */}
        <div className="space-y-3 mb-6">
          {orders.length > 0 ? (
            orders.map((order, idx) => (
              <div key={order.id} className="flex gap-3 items-end">
                <Input
                  ref={idx === 0 ? firstOrderInputRef : null}
                  type="text"
                  placeholder={order.received_by ? "أضف أو عدّل" : "أدخل اسم المستلم"}
                  value={orderValues[order.id] || ""}
                  onChange={(e) =>
                    setOrderValues((prev) => ({
                      ...prev,
                      [order.id]: e.target.value,
                    }))
                  }
                  className="flex-1 p-2 border border-gray-300 rounded text-right"
                  maxLength={15}
                />
                <span className="text-sm text-gray-600 whitespace-nowrap text-right">
                  {order.order_number}
                </span>
              </div>
            ))
          ) : (
            <Input
              ref={singleInputRef}
              type="text"
              placeholder="أدخل اسم المستلم"
              value={orderValues[0] || ""}
              onChange={(e) =>
                setOrderValues((prev) => ({ ...prev, [0]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleConfirm();
                }
              }}
              className="p-2 border border-gray-300 rounded w-full text-right"
              maxLength={15}
            />
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-center gap-4">
          <Button
            className="bg-green-600 hover:bg-green-700 text-white px-6"
            onClick={handleConfirm}
            title="F3"
          >
            موافق <span className="text-xs ml-2 opacity-75">(F3)</span>
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white px-6"
            onClick={handleCancel}
            title="Escape"
          >
            الغاء <span className="text-xs ml-2 opacity-75">(Esc)</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReceivedByPopup;
