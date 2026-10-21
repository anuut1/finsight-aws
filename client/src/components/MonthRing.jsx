// eslint-disable-next-line no-unused-vars
import { motion, useReducedMotion } from 'motion/react';

/**
 * MonthRing
 *
 * A slim SVG arc showing month days elapsed vs budget spent.
 * Teal when on track (spending <= time elapsed);
 * Shifts to Amber when spending runs ahead of time.
 */
const MonthRing = ({
  spentPercent = 0,
  elapsedPercent = null,
  size = 110,
  strokeWidth = 6,
  className = '',
  style = {},
}) => {
  const prefersReducedMotion = useReducedMotion();

  // If elapsedPercent is not provided, calculate based on current date in the month
  let calculatedElapsed = elapsedPercent;
  if (calculatedElapsed === null) {
    const now = new Date();
    const day = now.getDate();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    calculatedElapsed = Math.round((day / totalDays) * 100);
  }

  const clampedSpent = Math.max(0, Math.min(100, Math.round(spentPercent)));
  const clampedElapsed = Math.max(0, Math.min(100, Math.round(calculatedElapsed)));

  // On track: spent % <= elapsed % (or within small 5% margin)
  const isOnTrack = clampedSpent <= clampedElapsed + 4;
  const ringColor = isOnTrack ? 'var(--ring-teal, #14B8A6)' : 'var(--ring-amber, #F59E0B)';
  const statusLabel = isOnTrack ? 'On track' : 'Pacing fast';

  // SVG circular geometry
  const center = size / 2;
  const radius = center - strokeWidth - 2;
  const circumference = 2 * Math.PI * radius;

  // Arc lengths
  const elapsedOffset = circumference - (clampedElapsed / 100) * circumference;
  const spentOffset = circumference - (clampedSpent / 100) * circumference;

  return (
    <div
      className={`month-ring-container ${className}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        width: size,
        height: size,
        ...style,
      }}
      role="progressbar"
      aria-label={`Month progress: ${clampedElapsed}% elapsed, ${clampedSpent}% spent. Status: ${statusLabel}`}
      aria-valuenow={clampedSpent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--track-bg, rgba(255, 255, 255, 0.08))"
          strokeWidth={strokeWidth}
        />

        {/* Month elapsed indicator (subtle dashed track) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--border-strong, rgba(255, 255, 255, 0.16))"
          strokeWidth={strokeWidth - 2}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={elapsedOffset}
          strokeLinecap="round"
          opacity={0.7}
        />

        {/* Budget spent primary arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          initial={prefersReducedMotion ? { strokeDashoffset: spentOffset } : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: spentOffset }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.25, ease: [0.16, 1, 0.3, 1] }
          }
          strokeLinecap="round"
        />
      </svg>

      {/* Center status text */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        <span
          className="num-tabular"
          style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: ringColor,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {clampedSpent}%
        </span>
        <span
          style={{
            fontSize: '0.62rem',
            color: 'var(--text-muted)',
            marginTop: '3px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            fontWeight: 600,
          }}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
};

export default MonthRing;
