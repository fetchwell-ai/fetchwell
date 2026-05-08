import React from 'react';

/**
 * Skeleton screen shown while App.tsx is checking settings on first load.
 * Mirrors the sidebar + content area layout so the app doesn't flash blank.
 */
export default function AppSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      {/* Sidebar skeleton */}
      <div
        className="flex flex-col h-full bg-[#f0f0f5] border-r border-[#d2d2d7]"
        style={{ width: 240, minWidth: 240, maxWidth: 240 }}
      >
        {/* Traffic-light drag region */}
        <div className="flex-shrink-0" style={{ height: 52 }} />

        {/* App name placeholder */}
        <div className="px-4 pb-3 flex-shrink-0">
          <SkeletonBar width={80} height={13} />
        </div>

        {/* Section label placeholder */}
        <div className="px-4 mb-2 flex-shrink-0">
          <SkeletonBar width={55} height={10} />
        </div>

        {/* Portal rows */}
        <div className="flex-1 px-2 pb-2 flex flex-col gap-1">
          <SkeletonRow />
          <SkeletonRow width="75%" />
          <SkeletonRow width="85%" />
        </div>

        {/* Bottom nav placeholder */}
        <div className="flex-shrink-0 border-t border-[#d2d2d7] px-2 py-2">
          <SkeletonRow />
        </div>
      </div>

      {/* Content area skeleton */}
      <div className="flex-1 p-10">
        {/* Heading row */}
        <div className="mb-6 flex items-center justify-between">
          <SkeletonBar width={140} height={22} />
          <div className="flex gap-2">
            <SkeletonBar width={90} height={32} rounded="rounded-lg" />
            <SkeletonBar width={80} height={32} rounded="rounded-lg" />
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

// ── Skeleton primitives ──────────────────────────────────────────────────────

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
      className={`bg-[#d2d2d7]/60 animate-pulse ${rounded}`}
      style={{
        width: typeof width === 'number' ? width : width,
        height,
      }}
    />
  );
}

function SkeletonRow({ width = '90%' }: { width?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="w-2 h-2 rounded-full bg-[#d2d2d7]/60 animate-pulse flex-shrink-0" />
      <div
        className="h-3 rounded bg-[#d2d2d7]/60 animate-pulse"
        style={{ width }}
      />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-[#e4e4e8] px-6 py-5 shadow-sm">
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
        <SkeletonBar width={60} height={30} rounded="rounded-lg" />
        <SkeletonBar width={72} height={30} rounded="rounded-lg" />
        <SkeletonBar width={68} height={30} rounded="rounded-lg" />
      </div>
    </div>
  );
}
