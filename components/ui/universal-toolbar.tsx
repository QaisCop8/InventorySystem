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
  Printer,
  Menu,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState } from "react";

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
  isNewRecord?: boolean;
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
  isNewRecord = false,
  labels = defaultLabels,
}: UniversalToolbarProps) {
  const hasRecords = totalRecords > 0;
  const { toast } = useToast();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compactWidth, setCompactWidth] = useState(0);

  useEffect(() => {
    const element = toolbarRef.current;
    if (!element) return;
    const updateWidth = () => setCompactWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // New and Save are always kept in the compact row. The remaining actions are
  // progressively added only when the measured toolbar width can accommodate them.
  const compactVisibleCount = compactWidth < 500 ? 0 : compactWidth < 650 ? 1 : compactWidth < 800 ? 2 : compactWidth < 950 ? 3 : compactWidth < 1100 ? 4 : compactWidth < 1250 ? 5 : compactWidth < 1400 ? 6 : 7;
  const compactActionVisible = (index: number) => index < compactVisibleCount;
  // Use the overflow layout only when the actions that were actually supplied
  // cannot fit. A fixed breakpoint made small toolbars show "Other" even when
  // there was ample room for every available customer action.
  const requiredFullWidth = 48
    + (onNew ? 120 : 0)
    + (onSave ? 120 : 0)
    + (onPrint ? 105 : 0)
    + (onClone ? 100 : 0)
    + (onFirst ? 95 : 0)
    + (onPrevious ? 105 : 0)
    + (onNext ? 95 : 0)
    + (onLast ? 95 : 0)
    + (onDelete ? 100 : 0)
    + (onReport ? 115 : 0)
    + (onExportExcel ? 145 : 0)
    + (onLast ? 130 : 0);
  const useCompactToolbar = compactWidth > 0 && compactWidth < requiredFullWidth;
  const compactActions = [onPrint, onClone, onFirst, onPrevious, onNext, onLast, onDelete];
  const hasHiddenCompactActions = compactActions.some((action, index) => Boolean(action) && !compactActionVisible(index));
  const hasOverflowActions = hasHiddenCompactActions || Boolean(onReport) || Boolean(onExportExcel);

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

  // سجل جديد (لم يُحفظ بعد، بلا موضع طبيعي في تسلسل السجلات) — التالي/السابق كلاهما ينتقل لآخر
  // سجل موجود فعلياً بدل تجاهل الضغطة أو الانتقال لموضع لا معنى له.
  const handlePrevious = () => {
    //if (!hasRecords) return;
    if (isNewRecord) onLast?.();
    else onPrevious?.();
  };

  const handleNext = () => {
    //if (!hasRecords) return;
    if (isNewRecord) onLast?.();
    else onNext?.();
  };

  const handleLast = () => {
    //if (!hasRecords) return;
    onLast?.();
  };

  return (
    <div
      ref={toolbarRef}
      className="universal-toolbar relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-950/95 p-2.5 shadow-[0_25px_55px_-28px_rgba(2,8,23,0.85)]"
      dir="rtl"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_42%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.18),_transparent_40%)]" />
      <div className="relative flex min-w-0 flex-nowrap items-center justify-start gap-2">
        <div className={useCompactToolbar ? "order-last flex min-w-0 flex-nowrap items-center gap-2" : "hidden"}>
          {onNew && (
            <Button
              className="group inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(16,185,129,0.95)]"
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
              className="group inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(16,185,129,0.95)] disabled:opacity-70"
              onClick={onSave}
              disabled={isSaving || !canSave}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
                <Save className="h-4 w-4" />
              </span>
              <span>{isSaving ? "جاري الحفظ" : labels.save}</span>
            </Button>
          )}

          {onPrint && compactActionVisible(0) && <Button onClick={onPrint} disabled={isLoading || isSaving || !canPrint} className="shrink-0 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2.5 text-sm font-semibold text-white"><Printer className="h-4 w-4" /><span>{labels.print}</span></Button>}
          {onClone && compactActionVisible(1) && <Button onClick={onClone} disabled={isLoading || !canClone} className="shrink-0 rounded-xl bg-gradient-to-r from-sky-500 to-blue-500 px-3 py-2.5 text-sm font-semibold text-white"><Copy className="h-4 w-4" /><span>{labels.clone}</span></Button>}
          {onFirst && compactActionVisible(2) && <Button onClick={handleFirst} className="shrink-0 rounded-xl bg-white/10 px-3 py-2.5 text-sm text-slate-100"><ChevronsRight className="h-4 w-4" /><span>{labels.first}</span></Button>}
          {onPrevious && compactActionVisible(3) && <Button onClick={handlePrevious} className="shrink-0 rounded-xl bg-white/10 px-3 py-2.5 text-sm text-slate-100"><ChevronRight className="h-4 w-4" /><span>{labels.previous}</span></Button>}
          {onNext && compactActionVisible(4) && <Button onClick={handleNext} className="shrink-0 rounded-xl bg-white/10 px-3 py-2.5 text-sm text-slate-100"><ChevronLeft className="h-4 w-4" /><span>{labels.next}</span></Button>}
          {onLast && compactActionVisible(5) && <Button onClick={handleLast} className="shrink-0 rounded-xl bg-white/10 px-3 py-2.5 text-sm text-slate-100"><ChevronsLeft className="h-4 w-4" /><span>{labels.last}</span></Button>}
          {onDelete && compactActionVisible(6) && <Button onClick={onDelete} disabled={isLoading || !canDelete} className="shrink-0 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 px-3 py-2.5 text-sm font-semibold text-white"><Trash2 className="h-4 w-4" /><span>{labels.delete}</span></Button>}

          {hasOverflowActions && <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                aria-label="المزيد"
                className="h-10 shrink-0 gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-slate-100 hover:bg-white/20 hover:text-white"
              >
                <Menu className="h-5 w-5" />
                <span>{"\u0623\u062e\u0631\u0649"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[100] min-w-48 [direction:rtl]">
              {onPrint && !compactActionVisible(0) && <DropdownMenuItem disabled={isLoading || isSaving || !canPrint} onSelect={() => onPrint()}><Printer className="ml-2 h-4 w-4" />{labels.print}</DropdownMenuItem>}
              {onClone && !compactActionVisible(1) && <DropdownMenuItem disabled={isLoading || !canClone} onSelect={() => onClone()}><Copy className="ml-2 h-4 w-4" />{labels.clone}</DropdownMenuItem>}
              {onFirst && !compactActionVisible(2) && <DropdownMenuItem onSelect={handleFirst}><ChevronsRight className="ml-2 h-4 w-4" />{labels.first}</DropdownMenuItem>}
              {onPrevious && !compactActionVisible(3) && <DropdownMenuItem onSelect={handlePrevious}><ChevronRight className="ml-2 h-4 w-4" />{labels.previous}</DropdownMenuItem>}
              {onNext && !compactActionVisible(4) && <DropdownMenuItem onSelect={handleNext}><ChevronLeft className="ml-2 h-4 w-4" />{labels.next}</DropdownMenuItem>}
              {onLast && !compactActionVisible(5) && <DropdownMenuItem onSelect={handleLast}><ChevronsLeft className="ml-2 h-4 w-4" />{labels.last}</DropdownMenuItem>}
              {onDelete && !compactActionVisible(6) && <DropdownMenuItem disabled={isLoading || !canDelete} onSelect={() => onDelete()}><Trash2 className="ml-2 h-4 w-4 text-red-600" />{labels.delete}</DropdownMenuItem>}
              {onReport && <DropdownMenuItem onSelect={() => onReport()}><FileText className="ml-2 h-4 w-4" />{labels.report}</DropdownMenuItem>}
              {onExportExcel && <DropdownMenuItem onSelect={() => onExportExcel()}><Download className="ml-2 h-4 w-4" />{labels.exportExcel}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>

        <div className={useCompactToolbar ? "hidden" : "flex min-w-0 flex-nowrap items-center gap-2"}>
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
            disabled={isSaving || !canSave}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
              <Save className="h-4 w-4" />
            </span>
            <span>{isSaving ? "جاري الحفظ" : labels.save}</span>
          </Button>
        )}

        {onPrint && (
          <Button
            onClick={onPrint}
            disabled={isLoading || isSaving || !canPrint}
            className="group inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-500 to-orange-500 px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(245,158,11,0.95)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-12px_rgba(245,158,11,0.9)] disabled:opacity-70"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20">
              <Printer className="h-4 w-4" />
            </span>
            <span>{labels.print}</span>
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
          <Button
            onClick={handleLast}
            className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3.5 py-2.5 text-sm font-medium text-slate-100 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
              <ChevronsLeft className="h-4 w-4" />
            </span>
            <span>{labels.last}</span>
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

        {onReport && (
          <Button onClick={onReport} className="group inline-flex items-center gap-2 rounded-xl border border-indigo-400/30 bg-gradient-to-r from-indigo-500 to-violet-500 px-3.5 py-2.5 text-sm font-semibold text-white">
            <FileText className="h-4 w-4" />
            <span>{labels.report}</span>
          </Button>
        )}

        {onExportExcel && (
          <Button onClick={onExportExcel} className="group inline-flex items-center gap-2 rounded-xl border border-green-400/30 bg-gradient-to-r from-green-600 to-emerald-600 px-3.5 py-2.5 text-sm font-semibold text-white">
            <Download className="h-4 w-4" />
            <span>{labels.exportExcel}</span>
          </Button>
        )}

        {onLast && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 backdrop-blur">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
            <span className="tracking-wide">
              {hasRecords ? `${currentRecord} من ${totalRecords}` : "لا توجد سجلات"}
            </span>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
