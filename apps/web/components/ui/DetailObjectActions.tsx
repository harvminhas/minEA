"use client";

import { Edit2, Trash2 } from "lucide-react";
import { DetailPanelCloseButton } from "@/components/ui/DetailPanel";
import { usePermissions } from "@/lib/use-permissions";

interface DetailObjectActionsProps {
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  deletePending?: boolean;
  editLabel?: string;
  deleteLabel?: string;
}

/** Edit/delete icon actions for object detail drawers — hidden in viewer/share read-only mode. */
export function DetailObjectActions({
  onClose,
  onEdit,
  onDelete,
  deletePending,
  editLabel = "Edit",
  deleteLabel = "Delete",
}: DetailObjectActionsProps) {
  const { canEdit, canDelete } = usePermissions();

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {canEdit && onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label={editLabel}
        >
          <Edit2 size={14} />
        </button>
      )}
      {canDelete && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={deletePending}
          className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          aria-label={deleteLabel}
        >
          <Trash2 size={14} />
        </button>
      )}
      <DetailPanelCloseButton onClose={onClose} />
    </div>
  );
}
