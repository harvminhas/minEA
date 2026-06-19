"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useWorkspaceTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { ContactDetailPanel } from "@/components/people/ContactDetailPanel";
import { CreateContactPanel } from "@/components/people/CreateContactPanel";
import { initials, PEOPLE_LAYER_COLOR } from "@/lib/people-utils";
import type { PeopleContact } from "@minea/types";

const CARD_COLORS = ["#6366f1", "#0ea5e9", "#22c55e", "#f59e0b", "#e11d48"];

function ContactCard({
  contact,
  color,
  onClick,
}: {
  contact: PeopleContact;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-[#faf8f5] rounded-xl border border-gray-200/80 p-5 hover:border-rose-200 transition-colors cursor-pointer w-full"
    >
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {initials(contact.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 truncate">{contact.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {contact.team_name ? contact.team_name : "No team"}
            {contact.email ? ` · ${contact.email}` : ""}
          </p>
        </div>
      </div>
    </button>
  );
}

export default function ContactsPage() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useWorkspaceTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug);

  const [showCreate, setShowCreate] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["people-contacts", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listContacts(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const contacts = data?.items ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["people-contacts", orgSlug, workspaceSlug] });
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-8 pt-8 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: PEOPLE_LAYER_COLOR }}>
              People
            </p>
            <h1 className="text-2xl font-semibold text-gray-900">Contacts</h1>
            <p className="text-sm text-gray-500 mt-1">
              Who to ping day-to-day — used as point of contact on systems, products, and more.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg px-4 py-2 text-sm font-medium"
          >
            <Plus size={16} />
            New contact
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading contacts…</p>
          ) : contacts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center">
              <p className="text-sm text-gray-500 mb-4">No contacts yet.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-sm text-rose-600 hover:text-rose-700 font-medium"
              >
                Add your first contact
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {contacts.map((contact, index) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  color={CARD_COLORS[index % CARD_COLORS.length]!}
                  onClick={() => setSelectedContactId(contact.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateContactPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedContactId(id);
          }}
        />
      )}

      {selectedContactId && (
        <ContactDetailPanel
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
          onUpdate={refresh}
        />
      )}
    </>
  );
}
