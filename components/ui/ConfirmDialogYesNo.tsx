"use client";

import { Dialog } from "primereact/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, SaveAll, Sparkles } from "lucide-react";
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
    <div className={`flex justify-center gap-3 ${isCompact ? "mt-3" : "mt-5"}`}>
      <Button
        onClick={() => {
          onConfirm();
        }}
        className={`${isCompact ? "px-5 py-2 text-sm" : "px-7 py-3 text-base"} rounded-2xl border border-transparent bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-[0_10px_25px_-12px_rgba(244,63,94,0.9)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-12px_rgba(244,63,94,0.9)]`}
      >
        {showBack ? "نعم" : "تأكيد"}
      </Button>

      <Button
        onClick={onCancel}
        variant="outline"
        className={`${isCompact ? "px-5 py-2 text-sm" : "px-7 py-3 text-base"} rounded-2xl border-slate-200 bg-white text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-slate-50`}
      >
        {showBack ? "لا" : "إلغاء"}
      </Button>

      {showBack && onBack && (
        <Button
          onClick={onBack}
          className={`${isCompact ? "px-3 py-2 text-xs" : "px-4 py-2 text-sm"} rounded-2xl border border-slate-200 bg-slate-100 text-slate-700 transition-all hover:bg-slate-200`}
        >
          رجوع
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
      className="overflow-hidden rounded-[24px] border border-slate-200/80 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.35)]"
      style={{
        width: isCompact ? "420px" : "520px",
        direction: "rtl",
        textAlign: "center",
        background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,250,252,0.97))",
      }}
    >
      <div className={`flex flex-col items-center ${isCompact ? "px-2 py-3" : "px-3 py-5"}`}>
        <div className={`relative mb-3 flex items-center justify-center ${isCompact ? "h-12 w-12" : "h-16 w-16"}`}>
          <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${showBack ? "from-blue-500/20 to-cyan-500/20" : "from-rose-500/20 to-orange-500/20"}`} />
          <div className={`relative flex items-center justify-center rounded-full border ${showBack ? "border-blue-200 bg-blue-50" : "border-rose-200 bg-rose-50"} ${isCompact ? "h-10 w-10" : "h-14 w-14"}`}>
            {showBack ? (
              <SaveAll className={showBack ? "text-blue-600" : "text-rose-600"} size={isCompact ? 20 : 26} />
            ) : (
              <ShieldAlert className={showBack ? "text-blue-600" : "text-rose-600"} size={isCompact ? 20 : 26} />
            )}
          </div>
          <div className="absolute -top-1 -right-1 rounded-full bg-white p-1 shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          </div>
        </div>

        <div className={`rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm ${isCompact ? "max-w-[340px]" : "max-w-[420px]"}`}>
          <p className={`${isCompact ? "text-sm" : "text-base"} leading-7 text-slate-700`}>{message}</p>
        </div>
      </div>
    </Dialog>
  );
};

export default ConfirmDialogYesNo;
