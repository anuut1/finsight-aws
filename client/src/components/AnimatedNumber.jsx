import { useEffect, useState, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Quiet Ledger AnimatedNumber
 * Smoothly counts up once on load or when target value changes (150-250ms).
 * Formats as Indian Rupee (INR) currency with tabular figures.
 */
const AnimatedNumber = ({
  value = 0,
  duration = 220,
  prefix = '₹',
  className = '',
  style = {},
}) => {
  const prefersReducedMotion = useReducedMotion();
  const numericTarget = typeof value === 'number' ? value : Number(value) || 0;
  const [displayValue, setDisplayValue] = useState(numericTarget);
  const prevTargetRef = useRef(numericTarget);

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const startValue = prevTargetRef.current !== numericTarget ? prevTargetRef.current : 0;
    prevTargetRef.current = numericTarget;

    let startTime = null;
    let frameId;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (numericTarget - startValue) * easeProgress);

      setDisplayValue(current);

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [numericTarget, duration, prefersReducedMotion]);

  const effectiveValue = prefersReducedMotion ? numericTarget : displayValue;
  const formatted = Math.abs(effectiveValue).toLocaleString('en-IN');
  const isNegative = effectiveValue < 0;

  return (
    <span
      className={`num-tabular ${className}`}
      style={{
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
        ...style,
      }}
    >
      {isNegative ? '−' : ''}
      {prefix}
      {formatted}
    </span>
  );
};

export default AnimatedNumber;
