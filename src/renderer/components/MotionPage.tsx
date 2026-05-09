import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Wraps a page in a motion.div with enter/exit transitions.
 * Respects prefers-reduced-motion -- opacity only, no translateY.
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
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
      };

  // --fw-ease-in-out: cubic-bezier(.5, 0, .2, 1)
  const easeInOut: [number, number, number, number] = [0.5, 0, 0.2, 1];

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={
        shouldReduce
          ? { duration: 0.28 }
          : {
              duration: 0.28,
              ease: easeInOut,
            }
      }
    >
      {children}
    </motion.div>
  );
}
