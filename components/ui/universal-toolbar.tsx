"use client";

import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Save,
  Copy,
  Trash2,
  FileText,
  Download,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface UniversalToolbarProps {
  currentRecord?: number;
  totalRecords?: number;
  onFirst?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onLast?: () => void;
  onNew?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onExportExcel?: () => void;
  onPrint?: () => void;
  onClone?: () => void;
  isLoading?: boolean;
  isSaving?: boolean;
  canSave?: boolean;
  canPrint?: boolean;
  canDelete?: boolean;
  canClone?: boolean;
  isFirstRecord?: boolean;
  isLastRecord?: boolean;
  labels?: {
    new: string;
    save: string;
    previous: string;
    next: string;
    first: string;
    last: string;
    delete: string;
    report: string;
    exportExcel: string;
    print: string;
    clone: string;
  };
}

const defaultLabels = {
  new: "جديد",
  save: "حفظ",
  previous: "السابق",
  next: "التالي",
  first: "الأول",
  last: "الأخير",
  delete: "حذف",
  report: "استعلام",
  exportExcel: "تصدير إكسل",
  print: "طباعة",
  clone: "نسخ"
};

export function UniversalToolbar({
  currentRecord = 1,
  totalRecords = 0,
  onFirst,
  onPrevious,
  onNext,
  onLast,
  onNew,
  onSave,
  onDelete,
  onReport,
  onExportExcel,
  onPrint,
  onClone,
  isLoading = false,
  isSaving = false,
  canSave = true,
  canPrint = true,
  canDelete = true,
  canClone = true,
  isFirstRecord = false,
  isLastRecord = false,
  labels = defaultLabels,
}: UniversalToolbarProps) {
  const hasRecords = totalRecords > 0;
  const { toast } = useToast();

  const handleFirst = () => {
    /*if (!hasRecords) {
      toast({
        title: "لا توجد سجلات",
        description: "لا يوجد سجلات لعرضها.",
        variant: "default",
      });
      return;
    }*/
    onFirst?.();
  };

  const handlePrevious = () => {
    //if (!hasRecords) return;
    onPrevious?.();
  };

  const handleNext = () => {
    //if (!hasRecords) return;
    onNext?.();
  };

  const handleLast = () => {
    //if (!hasRecords) return;
    onLast?.();
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-950/95 p-2.5 shadow-[0_25px_55px_-28px_rgba(2,8,23,0.85)]"
      dir="rtl"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.18),_transparent_40%)]" />
      <div className="relative flex flex-wrap items-center justify-start gap-2">
        {onNew && (
          <Button
            className="group inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(16,185,129,0.95)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-12px_rgba(16,185,129,0.9)]"
            onClick={onNew}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
              <Plus className="h-4 w-4" />
            </span>
            <span>{labels.new}</span>
          </Button>
        )}

        {onSave && (
          <Button
            className="group inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(16,185,129,0.95)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-12px_rgba(16,185,129,0.9)] disabled:opacity-70"
            onClick={onSave}
            disabled={isSaving}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
              <Save className="h-4 w-4" />
            </span>
            <span>{isSaving ? "جاري الحفظ" : labels.save}</span>
          </Button>
        )}

        {onDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isLoading || !canDelete}
            className="group inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-gradient-to-r from-rose-500 to-red-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(244,63,94,0.95)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-12px_rgba(244,63,94,0.9)]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
              <Trash2 className="h-4 w-4" />
            </span>
            <span>{labels.delete}</span>
          </Button>
        )}

        {onClone && (
          <Button
            onClick={onClone}
            disabled={isLoading || !canClone}
            className="group inline-flex items-center gap-2 rounded-xl border border-sky-400/30 bg-gradient-to-r from-sky-500 to-blue-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(14,165,233,0.95)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-12px_rgba(14,165,233,0.9)] disabled:opacity-70"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
              <Copy className="h-4 w-4" />
            </span>
            <span>{labels.clone}</span>
          </Button>
        )}

        {onFirst && (
          <Button
            onClick={handleFirst}
            className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3.5 py-2.5 text-sm font-medium text-slate-100 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
              <ChevronsRight className="h-4 w-4" />
            </span>
            <span>{labels.first}</span>
          </Button>
        )}
        {onPrevious && (
          <Button
            onClick={handlePrevious}
            className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3.5 py-2.5 text-sm font-medium text-slate-100 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
              <ChevronRight className="h-4 w-4" />
            </span>
            <span>{labels.previous}</span>
          </Button>
        )}
        {onNext && (
          <Button
            onClick={handleNext}
            className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3.5 py-2.5 text-sm font-medium text-slate-100 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
              <ChevronLeft className="h-4 w-4" />
            </span>
            <span>{labels.next}</span>
          </Button>
        )}
        {onLast && (
          <div className="flex items-center gap-2">
            <Button
              onClick={handleLast}
              className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3.5 py-2.5 text-sm font-medium text-slate-100 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
                <ChevronsLeft className="h-4 w-4" />
              </span>
              <span>{labels.last}</span>
            </Button>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 backdrop-blur">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
              <span className="tracking-wide">
                {hasRecords ? `${currentRecord} من ${totalRecords}` : "لا توجد سجلات"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
