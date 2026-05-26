"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { TeamDetailPanel } from "@/components/people/TeamDetailPanel";
import { CreateTeamPanel } from "@/components/people/CreateTeamPanel";
import { initials, PEOPLE_LAYER_COLOR } from "@/lib/people-utils";
import type { Team } from "@minea/types";

const CARD_COLORS = ["#e11d48", "#6366f1", "#0ea5e9", "#22c55e", "#f59e0b"];

function TeamCard({
  team,
  color,
  onClick,
}: {
  team: Team;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-[#faf8f5] rounded-xl border border-gray-200/80 p-5 hover:border-rose-200 transition-colors cursor-pointer w-full"
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {initials(team.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 truncate">{team.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {team.role_count} role{team.role_count === 1 ? "" : "s"}
            {team.lead_name ? ` · Lead: ${team.lead_name}` : ""}
          </p>
        </div>
      </div>
      {team.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{team.description}</p>
      )}
    </button>
  );
}

export default function TeamsPage() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["people-teams", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return peopleApi.listTeams(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const teams = data?.items ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["people-teams", orgSlug, workspaceSlug] });
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ backgroundColor: `${PEOPLE_LAYER_COLOR}20`, color: PEOPLE_LAYER_COLOR }}
            >
              People Layer
            </span>
            <h1 className="text-lg font-semibold text-gray-900">Teams</h1>
            {data && (
              <span className="text-sm text-gray-400">
                {data.total} {data.total === 1 ? "team" : "teams"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading teams…</p>
          ) : teams.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm mb-3">No teams yet.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-rose-600 hover:underline text-sm"
              >
                Add your first team →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {teams.map((team, i) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  color={CARD_COLORS[i % CARD_COLORS.length]!}
                  onClick={() => setSelectedTeamId(team.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create panel — full-page overlay, opens detail on success */}
      {showCreate && (
        <CreateTeamPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(newId) => {
            setShowCreate(false);
            refresh();
            setSelectedTeamId(newId);
          }}
        />
      )}

      {/* Detail panel */}
      {selectedTeamId && (
        <TeamDetailPanel
          teamId={selectedTeamId}
          onClose={() => setSelectedTeamId(null)}
          onUpdate={refresh}
        />
      )}
    </>
  );
}
