import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Wraps a page in a motion.div with enter/exit transitions.
 * Respects prefers-reduced-motion — disables animation when the user
 * has requested reduced motion in their OS settings.
 */
export default function MotionPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();

  const variants = shouldReduce
    ? {
        initial: {},
        animate: {},
        exit: {},
      }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
      };

  // ease-out cubic bezier (must be a 4-tuple for TypeScript)
  const easeOut: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={
        shouldReduce
          ? undefined
          : {
              duration: 0.18,
              ease: easeOut,
            }
      }
    >
      {children}
    </motion.div>
  );
}
