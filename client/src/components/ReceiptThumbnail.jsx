import { useState, useEffect } from 'react';
import api from '../api/axios';
import Modal from './Modal';
import Button from './Button';

// Global cache for presigned URLs so we don't refetch on every re-render
const urlCache = new Map();

/**
 * ReceiptThumbnail Component
 *
 * Displays a small thumbnail for a receipt stored in S3.
 * Fetches the short-lived presigned GET URL via GET /splits/groups/:groupId/receipts/:key/url.
 * Tapping/clicking enlarges the receipt in a modal dialog.
 * Handles missing or expired (30-day lifecycle) objects gracefully.
 */
const ReceiptThumbnail = ({
  groupId,
  receiptKey,
  alt = 'Receipt thumbnail',
  size = 'md', // 'sm' | 'md' | 'lg'
}) => {
  const [url, setUrl] = useState(() => urlCache.get(receiptKey) || '');
  const [loading, setLoading] = useState(() => !urlCache.has(receiptKey));
  const [error, setError] = useState(false);
  const [isEnlarged, setIsEnlarged] = useState(false);

  useEffect(() => {
    if (!groupId || !receiptKey) return;
    if (urlCache.has(receiptKey)) return;

    let isMounted = true;

    api
      .get(`/splits/groups/${groupId}/receipts/${encodeURIComponent(receiptKey)}/url`)
      .then((res) => {
        if (!isMounted) return;
        const fetchedUrl = res.data?.data?.url || res.data?.data?.viewUrl || res.data?.url;
        if (fetchedUrl) {
          urlCache.set(receiptKey, fetchedUrl);
          setUrl(fetchedUrl);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setError(true);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [groupId, receiptKey]);

  const dimensions = {
    sm: { width: 32, height: 32, radius: 4 },
    md: { width: 44, height: 44, radius: 6 },
    lg: { width: 60, height: 60, radius: 8 },
  }[size] || { width: 44, height: 44, radius: 6 };

  if (loading) {
    return (
      <div
        aria-label="Loading receipt thumbnail"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: dimensions.radius,
          background: 'var(--bg-surface-elevated, rgba(255, 255, 255, 0.05))',
          border: '1px dashed var(--border-color, #cbd5e1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          flexShrink: 0,
        }}
      >
        <span style={{ opacity: 0.6 }}>⏳</span>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div
        title="Receipt unavailable (expired after 30 days or not found)"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: dimensions.radius,
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.8rem',
          color: 'var(--color-negative, #ef4444)',
          flexShrink: 0,
          cursor: 'default',
        }}
      >
        🧾
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsEnlarged(true)}
        title="Tap to enlarge receipt"
        aria-label="Enlarge receipt thumbnail"
        style={{
          padding: 0,
          margin: 0,
          border: '1px solid var(--border-color, #cbd5e1)',
          borderRadius: dimensions.radius,
          background: 'transparent',
          cursor: 'pointer',
          overflow: 'hidden',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: dimensions.width,
          height: dimensions.height,
          flexShrink: 0,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <img
          src={url}
          alt={alt}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
          onError={() => setError(true)}
        />
      </button>

      {/* Enlarged Receipt Modal */}
      <Modal
        title="🧾 Receipt Details"
        isOpen={isEnlarged}
        onClose={() => setIsEnlarged(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              maxHeight: '65vh',
              overflow: 'auto',
              borderRadius: 'var(--radius-md, 8px)',
              background: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
            }}
          >
            <img
              src={url}
              alt="Enlarged receipt"
              style={{
                maxWidth: '100%',
                maxHeight: '60vh',
                objectFit: 'contain',
                borderRadius: '4px',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
              color: 'var(--text-muted, #94a3b8)',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <span>Receipt available for 30 days</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--accent-primary, #6366F1)',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                Open full size ↗
              </a>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsEnlarged(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ReceiptThumbnail;
