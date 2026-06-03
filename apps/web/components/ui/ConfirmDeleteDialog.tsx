"use client";

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function ConfirmDeleteDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
  isPending = false,
}: Props) {
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={isPending ? undefined : onCancel} />
      <div
        role="dialog"
        aria-labelledby="confirm-delete-title"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 id="confirm-delete-title" className="font-semibold text-gray-900">
          {title}
        </h3>
        <div className="text-sm text-gray-500 mt-2">{message}</div>
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium"
          >
            {isPending ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
