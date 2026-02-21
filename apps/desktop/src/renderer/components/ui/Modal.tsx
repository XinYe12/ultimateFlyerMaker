// Shared Modal component using Radix Dialog with design token styling

import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** Optional: title for screen readers. If provided, shown in header; if not, hidden but still accessible. */
  title?: string;
  /** Optional: click overlay to close (default true) */
  closeOnOverlayClick?: boolean;
  contentStyle?: React.CSSProperties;
};

export default function Modal({
  open,
  onOpenChange,
  children,
  title,
  closeOnOverlayClick = true,
  contentStyle,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 10000,
          }}
          onClick={closeOnOverlayClick ? () => onOpenChange(false) : undefined}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "var(--color-bg)",
            borderRadius: "var(--radius-lg)",
            padding: 32,
            maxWidth: 600,
            width: "90%",
            boxShadow: "0 12px 48px rgba(0, 0, 0, 0.3)",
            zIndex: 10001,
            overflow: "auto",
            maxHeight: "90vh",
            ...contentStyle,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {title ? (
            <Dialog.Title style={{ margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }}>
              {title}
            </Dialog.Title>
          ) : (
            <Dialog.Title asChild>
              <VisuallyHidden>Dialog</VisuallyHidden>
            </Dialog.Title>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
