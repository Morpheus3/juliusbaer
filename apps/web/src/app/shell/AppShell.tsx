import { useEffect, useState, type JSX } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAssistant } from '@/state/assistant';
import { clientIdFromPath, useClientContext } from '@/state/clientContext';
import { AssistantDrawer } from './AssistantDrawer';
import { ClientStrip } from './ClientStrip';
import { ClientSwitcher } from './ClientSwitcher';
import { Rail } from './Rail';
import { TopBar } from './TopBar';

/** Keeps the client context in step with the URL, which is the source of truth. */
function useSyncClientContext(): void {
  const { pathname } = useLocation();
  const set = useClientContext((s) => s.setLastClientId);
  const id = clientIdFromPath(pathname);
  useEffect(() => {
    if (id !== null) {
      set(id);
    }
  }, [id, set]);
}

/** Persistent frame: navy rail, top bar with the dataset clock, client strip, scrolling work area. */
export function AppShell(): JSX.Element {
  useSyncClientContext();
  const [switcher, setSwitcher] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSwitcher((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        useAssistant.getState().toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const openSwitcher = (): void => {
    setSwitcher(true);
  };

  return (
    <div className="grid h-screen grid-cols-[232px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden">
      <Rail />
      <div className="flex min-w-0 flex-col">
        <TopBar onSwitch={openSwitcher} />
        <ClientStrip onSwitch={openSwitcher} />
        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-6">
            <Outlet />
          </main>
          <AssistantDrawer />
        </div>
      </div>
      <ClientSwitcher
        open={switcher}
        onClose={() => {
          setSwitcher(false);
        }}
      />
    </div>
  );
}
