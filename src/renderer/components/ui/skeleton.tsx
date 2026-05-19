import React from 'react';

export function SkeletonBar({
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
        width: typeof width === 'number' ? `${width}px` : width,
        height,
        animationDuration: '1.4s',
        animationTimingFunction: 'ease-in-out',
      }}
    />
  );
}
