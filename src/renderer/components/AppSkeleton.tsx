import React from 'react';

/**
 * Skeleton screen shown while App.tsx is checking settings on first load.
 * Mirrors the sidebar + content area layout so the app doesn't flash blank.
 */
export default function AppSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-fw-bg)]">
      {/* Sidebar skeleton */}
      <div
        className="flex flex-col h-full bg-[var(--color-fw-bg-deep)] border-r border-[var(--color-fw-border)]"
        style={{ width: 240, minWidth: 240, maxWidth: 240 }}
      >
        {/* Traffic-light drag region + logo — matches Sidebar.tsx titlebar height */}
        <div
          className="flex-shrink-0 flex items-end pb-[10px] gap-2"
          style={{ height: 52, paddingLeft: 16 }}
        >
          <SkeletonBar width={20} height={20} rounded="rounded-md" />
          <SkeletonBar width={72} height={14} />
        </div>

        {/* Section label placeholder */}
        <div className="px-2 pt-2.5 pb-1.5 flex-shrink-0" style={{ paddingLeft: 16 }}>
          <SkeletonBar width={55} height={10} />
        </div>

        {/* Portal rows */}
        <div className="flex-1 px-2 pb-2 flex flex-col gap-1">
          <SkeletonRow />
          <SkeletonRow width="75%" />
          <SkeletonRow width="85%" />
        </div>

        {/* Bottom nav placeholder */}
        <div className="flex-shrink-0 border-t border-[var(--color-fw-border)] px-2 py-2">
          <SkeletonRow />
        </div>
      </div>

      {/* Content area skeleton */}
      <div className="flex-1 p-10">
        {/* Heading row */}
        <div className="mb-6 flex items-center justify-between">
          <SkeletonBar width={140} height={22} />
          <div className="flex gap-2">
            <SkeletonBar width={90} height={32} rounded="rounded-[var(--radius-md)]" />
            <SkeletonBar width={80} height={32} rounded="rounded-[var(--radius-md)]" />
          </div>
        </div>

        {/* Card skeletons */}
        <div className="flex flex-col gap-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}

// -- Skeleton primitives --

function SkeletonBar({
  width,
  height,
  rounded = 'rounded-md',
}: {
  width: number | string;
  height: number;
  rounded?: string;
}) {
  return (
    <div
      className={`bg-[var(--color-fw-bg-deep)] animate-pulse ${rounded}`}
      style={{
        width: typeof width === 'number' ? width : width,
        height,
        animationDuration: '1.4s',
        animationTimingFunction: 'ease-in-out',
      }}
    />
  );
}

function SkeletonRow({ width = '90%' }: { width?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div
        className="w-2 h-2 rounded-full bg-[var(--color-fw-bg-deep)] animate-pulse flex-shrink-0"
        style={{ animationDuration: '1.4s', animationTimingFunction: 'ease-in-out' }}
      />
      <div
        className="h-3 rounded bg-[var(--color-fw-bg-deep)] animate-pulse"
        style={{ width, animationDuration: '1.4s', animationTimingFunction: 'ease-in-out' }}
      />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-[var(--color-fw-card-bg)] rounded-[var(--radius-md)] border border-[var(--color-fw-border)] px-6 py-5 shadow-[var(--shadow-fw-1)]">
      {/* Card header row */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <SkeletonBar width={160} height={14} />
          <SkeletonBar width={240} height={11} />
        </div>
        <SkeletonBar width={26} height={26} rounded="rounded-md" />
      </div>
      {/* Badges row */}
      <div className="mb-4 flex gap-2">
        <SkeletonBar width={100} height={20} rounded="rounded-full" />
      </div>
      {/* Buttons row */}
      <div className="flex gap-2">
        <SkeletonBar width={60} height={30} rounded="rounded-[var(--radius-md)]" />
        <SkeletonBar width={72} height={30} rounded="rounded-[var(--radius-md)]" />
        <SkeletonBar width={68} height={30} rounded="rounded-[var(--radius-md)]" />
      </div>
    </div>
  );
}
