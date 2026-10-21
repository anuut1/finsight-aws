import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import Input from './Input.jsx';
import api from '../api/axios.js';

/**
 * UpiSettlementModal
 *
 * Generates dynamic NPCI-compliant UPI payment QR codes and deep links
 * for group expense and trip balance settlements.
 */
const UpiSettlementModal = ({
  isOpen,
  onClose,
  debt,
  groupId,
  groupName = 'FinSight',
  onSettled,
}) => {
  const [payeeUpi, setPayeeUpi] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auto-suggest a VPA or reset when debt changes
  useEffect(() => {
    if (debt?.toName) {
      const suggested = `${debt.toName.toLowerCase().replace(/[^a-z0-9]/g, '')}@okaxis`;
      setPayeeUpi(suggested);
      setError('');
      setCopied(false);
    }
  }, [debt]);

  // Construct NPCI UPI spec URL
  const amount = Number(debt?.amount || 0);
  const upiUrl = payeeUpi.trim()
    ? `upi://pay?pa=${encodeURIComponent(payeeUpi.trim())}&pn=${encodeURIComponent(debt?.toName || 'Friend')}&am=${amount}&cu=INR&tn=${encodeURIComponent(`FinSight - ${groupName}`)}`
    : '';

  // Generate QR code data URL whenever upiUrl updates
  useEffect(() => {
    if (!upiUrl) {
      setQrCodeUrl('');
      return;
    }

    QRCode.toDataURL(upiUrl, {
      width: 240,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.warn('Could not generate UPI QR code:', err));
  }, [upiUrl]);

  if (!debt) return null;

  const handleCopyLink = () => {
    if (!upiUrl) return;
    navigator.clipboard?.writeText(upiUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleRecordSettlement = async () => {
    if (!groupId) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await api.post(`/splits/groups/${groupId}/settlements`, {
        from: debt.from,
        to: debt.to,
        amount,
        date: new Date().toISOString().slice(0, 10),
        note: `Settled via UPI to ${payeeUpi || debt.toName}`,
      });

      if (res.data?.success) {
        if (onSettled) onSettled(res.data.data);
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record settlement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Settle with UPI"
      isOpen={isOpen}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Payment Summary Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-md, 12px)',
            background: 'var(--bg-surface-elevated, #F8FAFC)',
            border: '1px solid var(--border-color)',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Paying to <strong style={{ color: 'var(--text-primary)' }}>{debt.toName}</strong>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              From {debt.fromName}
            </div>
          </div>
          <div className="num-tabular" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-positive, #10B981)' }}>
            ₹{amount.toLocaleString('en-IN')}
          </div>
        </div>

        {error && <div className="inline-error">{error}</div>}

        {/* UPI ID Input & presets */}
        <div>
          <Input
            label={`${debt.toName}'s UPI ID (VPA)`}
            id="payee-upi-id"
            value={payeeUpi}
            onChange={(e) => setPayeeUpi(e.target.value)}
            placeholder="e.g. mobile@upi or name@okhdfcbank"
            required
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
            {['@okaxis', '@okhdfcbank', '@paytm', '@ybl'].map((handle) => (
              <button
                key={handle}
                type="button"
                onClick={() => {
                  const base = payeeUpi.split('@')[0] || debt.toName.toLowerCase().replace(/\s+/g, '');
                  setPayeeUpi(`${base}${handle}`);
                }}
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                {handle}
              </button>
            ))}
          </div>
        </div>

        {/* QR Code Container */}
        {qrCodeUrl ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.25rem',
              borderRadius: 'var(--radius-card, 16px)',
              background: '#FFFFFF',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
              border: '1px solid #E2E8F0',
              textAlign: 'center',
            }}
          >
            <img
              src={qrCodeUrl}
              alt="UPI Payment QR Code"
              style={{
                width: '190px',
                height: '190px',
                borderRadius: '8px',
                display: 'block',
              }}
            />
            <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '10px', fontWeight: 500 }}>
              Scan with GPay, PhonePe, Paytm, or any UPI App
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Enter a valid UPI ID above to generate the payment QR code.
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {/* Mobile Deep Link */}
          {upiUrl && (
            <a
              href={upiUrl}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                textDecoration: 'none',
                padding: '0.65rem 1.25rem',
                fontSize: '0.92rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-md, 10px)',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                color: '#FFFFFF',
              }}
            >
              <span>⚡ Open UPI App (GPay / PhonePe / Paytm)</span>
            </a>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopyLink}
              style={{ flex: 1 }}
            >
              {copied ? '✓ Link Copied!' : '📋 Copy UPI Link'}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={submitting}
              onClick={handleRecordSettlement}
              style={{ flex: 1.2 }}
            >
              ✓ Record as Settled
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default UpiSettlementModal;
