"use client";

interface Props {
  stageName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteStageConfirmDialog({ stageName, onConfirm, onCancel }: Props) {
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={onCancel} />
      <div
        role="dialog"
        aria-labelledby="delete-stage-title"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 id="delete-stage-title" className="font-semibold text-gray-900">
          Remove stage?
        </h3>
        <p className="text-sm text-gray-500 mt-2">
          <span className="font-medium text-gray-700">{stageName}</span> will be removed from this
          process. This cannot be undone until you save a new draft.
        </p>
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-md py-2 text-sm font-medium"
          >
            Remove
          </button>
        </div>
      </div>
    </>
  );
}
