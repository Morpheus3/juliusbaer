import type { JSX } from 'react';
export function PlaceholderPage({
  title,
  iteration,
}: {
  title: string;
  iteration?: number;
}): JSX.Element {
  return (
    <div className="mx-auto max-w-2xl pt-16 text-center">
      <h1 className="font-serif text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-muted">
        {iteration === undefined
          ? 'There is nothing at this address.'
          : `Planned for build iteration ${iteration}. The route and navigation exist so the shell is complete.`}
      </p>
    </div>
  );
}
