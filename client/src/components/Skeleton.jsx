import { useReducedMotion } from 'motion/react';

const Skeleton = ({
  width = '100%',
  height = '1rem',
  borderRadius = 'var(--radius-md, 12px)',
  style = {},
  className = '',
}) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={`skeleton-pulse ${className}`}
      style={{
        width,
        height,
        borderRadius,
        background: 'var(--bg-surface-elevated, #1B243B)',
        opacity: prefersReducedMotion ? 0.6 : 1,
        animation: prefersReducedMotion ? 'none' : 'skeletonShimmer 1.8s ease-in-out infinite',
        ...style,
      }}
    />
  );
};

export default Skeleton;
