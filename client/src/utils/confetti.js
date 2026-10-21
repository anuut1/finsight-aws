// Lightweight zero-dependency canvas confetti for Calm Ledger celebrations
// Automatically respects prefers-reduced-motion

export function triggerConfetti() {
  if (typeof window === 'undefined') return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = (canvas.width = window.innerWidth * dpr);
  const height = (canvas.height = window.innerHeight * dpr);

  const colors = ['#6366F1', '#10B981', '#F59E0B', '#38BDF8', '#EC4899', '#A855F7'];
  const particleCount = 45;
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: width * 0.5 + (Math.random() - 0.5) * 200 * dpr,
      y: height * 0.45,
      vx: (Math.random() - 0.5) * 14 * dpr,
      vy: (Math.random() * -12 - 4) * dpr,
      size: (Math.random() * 8 + 5) * dpr,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 12,
      opacity: 1,
    });
  }

  const startTime = Date.now();
  const duration = 1800; // ms

  function frame() {
    const elapsed = Date.now() - startTime;
    if (elapsed > duration) {
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      return;
    }

    ctx.clearRect(0, 0, width, height);

    const progress = elapsed / duration;
    const fade = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;

    for (let p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35 * dpr; // gravity
      p.rotation += p.vRotation;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
