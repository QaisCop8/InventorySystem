"use client";

import { Dialog } from "primereact/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, SaveAll } from "lucide-react";
import React, { useEffect } from "react";

interface ConfirmDialogProps {
  visible: boolean;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
  onBack?: () => void; // handler for "إلغاء"
  showBack?: boolean;  // true = show third button (unsaved changes mode)
  isCompact?: boolean; // true = smaller fonts and icons for compact mode
}

const ConfirmDialogYesNo: React.FC<ConfirmDialogProps> = ({
  visible,
  message = "هل أنت متأكد من الحذف؟",
  onConfirm,
  onCancel,
  onBack,
  showBack = false,
  isCompact = false,
}) => {

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (showBack && onBack) {
          onBack();
        } else {
          onCancel();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, onConfirm, onCancel, onBack, showBack]);

  const footer = (
    <div className={`flex justify-center gap-2 mt-4 ${isCompact ? "mt-3" : "mt-5"}`}>
      <Button
        onClick={() => {
          onConfirm();
        }}
        className={`${isCompact ? "px-5 py-2 text-base" : "px-7 py-3 text-lg"} rounded-xl shadow-lg ${showBack
            ? "bg-blue-600 hover:bg-blue-700 text-white"
            : "bg-red-600 hover:bg-red-700 text-white"
          }`}
      >
        {showBack ? "نعم" : isCompact ? "حذف" : "نعم (F3)"}
      </Button>

      <Button
        onClick={onCancel}
        variant="outline"
        className={`${isCompact ? "px-5 py-2 text-base" : "px-7 py-3 text-lg"} rounded-xl border-gray-400`}
      >
        {showBack ? "لا" : isCompact ? "إلغاء" : "لا (ESC)"}
      </Button>

      {showBack && onBack && (
        <Button
          onClick={onBack}
          className={`${isCompact ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} rounded-xl bg-gray-300 hover:bg-gray-400 text-black`}
        >
          إلغاء
        </Button>
      )}
    </div>
  );

  return (
    <Dialog
      visible={visible}
      onHide={onCancel}
      footer={footer}
      modal
      closable={false}
      className={`rounded-3xl shadow-2xl border-2 ${showBack ? "border-blue-400" : "border-red-400"
        } backdrop-blur-xl`}
      style={{
        width: isCompact ? "420px" : "520px",
        direction: "rtl",
        textAlign: "center",
        background: "rgba(255, 255, 255, 0.95)",
      }}
    >
      <div className={`flex flex-col items-center ${isCompact ? "py-2" : "py-4"}`}>
        <div
          className={`bg-white border-2 ${isCompact ? "p-2 rounded-full" : "p-4 rounded-full"} shadow-md ${showBack ? "border-blue-400" : "border-red-400"
            }`}
        >
          {showBack ? (
            <SaveAll className="text-blue-600" size={isCompact ? 20 : 30} />
          ) : (
            <ShieldAlert className="text-red-600" size={isCompact ? 20 : 30} />
          )}
        </div>

        <h2
          className={`font-bold ${isCompact ? "text-base mt-2" : "text-2xl mt-4"} ${showBack ? "text-blue-700" : "text-gray-800"
            }`}
        >
        </h2>

        <p className={`${isCompact ? "text-sm mt-2 px-3" : "text-gray-600 mt-3 px-4 text-lg"} text-gray-600`}>{message}</p>
      </div>
    </Dialog>
  );
};

export default ConfirmDialogYesNo;
