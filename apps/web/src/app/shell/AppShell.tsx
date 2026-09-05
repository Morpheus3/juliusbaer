import type { JSX } from 'react';
import { Outlet } from 'react-router-dom';
import { Rail } from './Rail';
import { TopBar } from './TopBar';

/** Persistent frame: navy module rail, top bar with the dataset clock, scrolling work area. */
export function AppShell(): JSX.Element {
  return (
    <div className="grid h-full grid-cols-[232px_minmax(0,1fr)]">
      <Rail />
      <div className="flex min-w-0 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
