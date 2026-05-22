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
      className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 sm:gap-3 p-3 bg-white border-b shadow-sm rounded-lg"
      dir="rtl"
    >
      {/* All toolbar items aligned to right */}
      <div className="flex flex-wrap gap-2 items-center justify-start w-full">
        {/* New & Save Buttons */}
        {onNew && (
          <Button
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm"
            onClick={onNew}
          >
            <Plus className="h-4 w-4" />
            {labels.new}
          </Button>
        )}

        {onSave && (
          <Button
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm"
            onClick={onSave}
            disabled={isSaving || !canSave}
          >
            <Save className="h-4 w-4" />
            {isSaving ? "جاري الحفظ..." : labels.save}
          </Button>
        )}

        {/* Delete */}
        {onDelete && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={isLoading || !canDelete}
            className="flex items-center gap-1 px-4 py-2 rounded-lg hover:bg-red-600 hover:text-white transition text-sm"
          >
            <Trash2 className="h-4 w-4" />
            {labels.delete}
          </Button>
        )}

        {/* Report Menu 
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-sm"
            >
              <FileText className="h-4 w-4" />
              {labels.report}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onReport && (
              <DropdownMenuItem
                onClick={onReport}
                className="text-sm flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                عرض التقرير
              </DropdownMenuItem>
            )}
            {onExportExcel && (
              <DropdownMenuItem
                onClick={onExportExcel}
                className="text-sm flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {labels.exportExcel}
              </DropdownMenuItem>
            )}
            {onPrint && (
              <DropdownMenuItem
                onClick={onPrint}
                className="text-sm flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                {labels.print}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
*/}

        {onPrint && (
          <Button
            onClick={onPrint}
            disabled={isLoading || isSaving || !canPrint}
            className="text-sm flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            {labels.print}
          </Button>
        )}
        
        {onClone && (
          <Button
            onClick={onClone}
            disabled={isLoading || !canClone }
            className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-sm"
          >

            <Copy className="h-4 w-4" />
            <span>{labels.clone}</span>
          </Button>
        )}
        {onReport && (
          <Button
            onClick={onReport}
            className="text-sm flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            {labels.report}
          </Button>
        )}
        {/* Navigation */}
        {onFirst && (
          <Button
            onClick={handleFirst}
            className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-sm"
          >
            <span>{labels.first}</span>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}
        {onPrevious && (
          <Button
            onClick={handlePrevious}
            className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-sm"
          >
            <span>{labels.previous}</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {onNext && (
          <Button
            onClick={handleNext}
            className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-sm"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{labels.next}</span>
          </Button>
        )}
        {onLast && (
          <Button
            onClick={handleLast}
            className="flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-gray-100 transition text-sm"
          >
            <ChevronsLeft className="h-4 w-4" />
            <span>{labels.last}</span>
          </Button>
        )}

        {/* Record Counter */}
        <div className="text-sm font-medium text-gray-600 text-right">
          {hasRecords ? `${currentRecord} من ${totalRecords}` : "لا توجد سجلات"}
        </div>
      </div>
    </div>
  );
}
