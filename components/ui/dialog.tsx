"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useWorkspaceDialog } from "@/contexts/workspace-dialog-context"

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const { confined } = useWorkspaceDialog()
  React.useEffect(() => {
    if (props.open) return

    const cleanupTimer = window.setTimeout(() => {
      const hasOpenDialog = document.querySelector('[role="dialog"][data-state="open"]')
      const hasOpenOverlay = document.querySelector('[data-radix-dialog-overlay][data-state="open"]')
      if (!hasOpenDialog && !hasOpenOverlay && document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = ""
      }
    }, 250)

    return () => window.clearTimeout(cleanupTimer)
  }, [props.open])

  return <DialogPrimitive.Root {...props} modal={props.modal ?? !confined} />
}

const DialogTrigger = DialogPrimitive.Trigger

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const { container } = useWorkspaceDialog()
  return <DialogPrimitive.Portal {...props} container={container ?? props.container} />
}

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const { confined } = useWorkspaceDialog()
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-radix-dialog-overlay="true"
      className={cn(
        confined ? "absolute" : "fixed",
        confined ? "pointer-events-none" : "pointer-events-auto",
        "inset-0 z-40 bg-white/70 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:pointer-events-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
})
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  hideCloseButton?: boolean
  inline?: boolean
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, hideCloseButton, inline, style, ...props }, ref) => {
  const { confined } = useWorkspaceDialog()
  const isLargeTransactionDialog = typeof className === "string" && /(?:sales-delivery|stock-voucher)-form/.test(className)
  if (inline) {
    const { onPointerDownOutside: _onPointerDownOutside, onInteractOutside: _onInteractOutside, onEscapeKeyDown: _onEscapeKeyDown, ...inlineProps } = props
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn("!absolute !inset-0 z-30 grid !h-full !max-h-full !w-full !max-w-none gap-4 overflow-hidden border-4 border-emerald-600 bg-background shadow-none", className)}
        style={style}
        {...inlineProps}
      >
        {children}
        {!hideCloseButton && (
          <DialogPrimitive.Close
            type="button"
            aria-label="Close"
            className="universal-dialog-close absolute left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg ring-1 ring-slate-200 transition-opacity duration-200 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </div>
    )
  }
  return <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        confined
          ? "absolute left-1/2 top-3 max-h-[calc(100%-1.5rem)] -translate-x-1/2 overflow-y-auto"
          : "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "pointer-events-auto z-50 grid w-full max-w-lg gap-4 border-4 border-emerald-600 bg-background p-6 shadow-lg ring-2 ring-emerald-600/20 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
        className,
      )}
      style={{
        ...(confined && isLargeTransactionDialog
          ? { width: "calc(100% - 1.5rem)", maxWidth: "calc(100% - 1.5rem)" }
          : {}),
        ...style,
      }}
      {...props}
    >
      {children}
      {!hideCloseButton && (
        <DialogPrimitive.Close
          type="button"
          aria-label="Close"
          className="universal-dialog-close absolute left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg ring-1 ring-slate-200 transition-opacity duration-200 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-right", className)} {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
