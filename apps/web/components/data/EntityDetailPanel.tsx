"use client";

import { DataObjectDetail } from "@/components/data/DataObjectDetail";

interface Props {
  entityId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function EntityDetailPanel(props: Props) {
  return <DataObjectDetail {...props} />;
}
