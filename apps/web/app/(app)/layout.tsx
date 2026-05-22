import { Sidebar } from "@/components/sidebar/Sidebar";
import { ChatPanel } from "@/components/ai/ChatPanel";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-[220px] overflow-y-auto">
        {children}
      </main>
      <ChatPanel />
    </div>
  );
}
