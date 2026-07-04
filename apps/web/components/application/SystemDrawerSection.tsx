"use client";

interface Props {
  title: string;
  count: number;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}

export function SystemDrawerSection({
  title,
  count,
  onAdd,
  addLabel = "Add",
  children,
}: Props) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title} ({count})
        </h3>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            {addLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
