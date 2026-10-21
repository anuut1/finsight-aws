import { useState, useEffect, useCallback } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import ReceiptThumbnail from './ReceiptThumbnail.jsx';
import api from '../api/axios.js';
import useAuth from '../hooks/useAuth.js';

/**
 * ItemClaimModal
 *
 * Collaborative screen for trip members to claim individual items, view their
 * live proportional share (with tax & discounts calculated in integer paise),
 * and for the host to finalize the bill into a group expense.
 */
const ItemClaimModal = ({ isOpen, onClose, trip, billId, onBillFinalized }) => {
  const { user } = useAuth();
  const [bill, setBill] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [myShare, setMyShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claimingItemId, setClaimingItemId] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Host policy override states
  const [unclaimedPolicy, setUnclaimedPolicy] = useState('split_equally');
  const [nonResponderPolicy, setNonResponderPolicy] = useState('split_equally');

  const symbol = trip?.currency === 'USD' ? '$' : trip?.currency === 'EUR' ? '€' : '₹';

  const fetchBillData = useCallback(async () => {
    if (!trip?._id || !billId) return;
    try {
      setError('');
      const res = await api.get(`/splits/groups/${trip._id}/bills/${billId}`);
      if (res.data?.success) {
        setBill(res.data.data.bill);
        setBreakdown(res.data.data.breakdown);
        setMyShare(res.data.data.myShare);
        setUnclaimedPolicy(res.data.data.bill.unclaimedPolicy || 'split_equally');
        setNonResponderPolicy(res.data.data.bill.nonResponderPolicy || 'split_equally');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load bill details.');
    } finally {
      setLoading(false);
    }
  }, [trip?._id, billId]);

  useEffect(() => {
    if (isOpen && billId) {
      setLoading(true);
      setError('');
      setSuccessMsg('');
      fetchBillData();
    }
  }, [isOpen, billId, fetchBillData]);

  if (!isOpen) return null;

  // Identify current member in the group
  const currentMember = (trip?.members || []).find(
    (m) => m.userId && user?.id && m.userId.toString() === user.id.toString()
  );
  const currentMemberId = currentMember?._id?.toString();

  // Host authorization: owner of group, bill creator, or bill payer
  const isOwner = trip?.userRole === 'owner' || trip?.canManage;
  const isCreator = bill?.createdBy && user?.id && bill.createdBy.toString() === user.id.toString();
  const isPayer = bill && currentMemberId && bill.paidBy?.toString() === currentMemberId;
  const isHost = isOwner || isCreator || isPayer;
  const isFinalized = bill?.status === 'finalized';

  const handleClaim = async (itemId, targetUnits) => {
    if (isFinalized || !bill) return;
    setClaimingItemId(itemId);
    setError('');

    try {
      const res = await api.post(`/splits/groups/${trip._id}/bills/${bill._id}/claim`, {
        itemId,
        units: Math.max(0, targetUnits),
      });

      if (res.data?.success) {
        setBill(res.data.data.bill);
        setBreakdown(res.data.data.breakdown);
        setMyShare(res.data.data.myShare);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update claim.');
    } finally {
      setClaimingItemId(null);
    }
  };

  const handleFinalize = async () => {
    if (!isHost || isFinalized || !bill) return;
    setActionLoading(true);
    setError('');

    try {
      const res = await api.post(`/splits/groups/${trip._id}/bills/${bill._id}/finalize`, {
        unclaimedPolicy,
        nonResponderPolicy,
      });

      if (res.data?.success) {
        setSuccessMsg('Bill successfully finalized into trip expenses!');
        setBill(res.data.data.bill);
        if (onBillFinalized) {
          onBillFinalized(res.data.data);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to finalize bill.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelBill = async () => {
    if (!isHost || isFinalized || !bill) return;
    if (!window.confirm('Are you sure you want to cancel this itemized bill?')) return;
    setActionLoading(true);
    setError('');

    try {
      const res = await api.post(`/splits/groups/${trip._id}/bills/${bill._id}/cancel`);
      if (res.data?.success) {
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to cancel bill.');
    } finally {
      setActionLoading(false);
    }
  };

  const getMemberName = (mId) => {
    const member = (trip?.members || []).find((m) => m._id?.toString() === mId?.toString());
    return member?.name || 'Member';
  };

  return (
    <Modal title={bill?.title || 'Claim Items'} isOpen={isOpen} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading bill details…
          </div>
        ) : error && !bill ? (
          <div role="alert" style={{ color: 'var(--color-warning)', padding: '1rem' }}>
            {error}
          </div>
        ) : (
          <>
            {/* Header info bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--bg-surface-elevated, rgba(255,255,255,0.03))',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {bill?.receiptKey && (
                  <ReceiptThumbnail
                    groupId={trip._id}
                    receiptKey={bill.receiptKey}
                    size="md"
                    alt={`Receipt for ${bill.title}`}
                  />
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 7px',
                        borderRadius: '4px',
                        background: isFinalized ? 'rgba(99, 102, 241, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: isFinalized ? 'var(--accent-primary, #6366F1)' : 'var(--accent-success, #10B981)',
                        border: `1px solid ${isFinalized ? 'rgba(99, 102, 241, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                      }}
                    >
                      {isFinalized ? '✓ FINALIZED' : 'CLAIMING IN PROGRESS'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Paid by {getMemberName(bill.paidBy)}
                    </span>
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {symbol}
                    {Number(bill.total).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                <div>Tax: {symbol}{Number(bill.tax || 0).toFixed(2)}</div>
                {Number(bill.serviceCharge || 0) > 0 && (
                  <div>Service: {symbol}{Number(bill.serviceCharge).toFixed(2)}</div>
                )}
                {Number(bill.discount || 0) > 0 && (
                  <div style={{ color: 'var(--accent-success, #10B981)' }}>
                    Discount: -{symbol}{Number(bill.discount).toFixed(2)}
                  </div>
                )}
              </div>
            </div>

            {/* My Running Total Banner */}
            {myShare && (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-primary, #6366F1)', textTransform: 'uppercase' }}>
                    Your Running Share
                  </div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {symbol}
                    {Number(myShare.total).toFixed(2)}
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4, textAlign: 'right' }}>
                  <div>Items: {symbol}{Number(myShare.itemsSubtotal || 0).toFixed(2)}</div>
                  {Number(myShare.unclaimedShare || 0) > 0 && (
                    <div>Unclaimed: {symbol}{Number(myShare.unclaimedShare).toFixed(2)}</div>
                  )}
                  <div>Tax & Fees: {symbol}{(Number(myShare.taxShare || 0) + Number(myShare.serviceChargeShare || 0) - Number(myShare.discountShare || 0)).toFixed(2)}</div>
                </div>
              </div>
            )}

            {/* Success or Error alert */}
            {successMsg && (
              <div
                role="status"
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid var(--accent-success, #10B981)',
                  color: 'var(--accent-success, #10B981)',
                  fontSize: '0.82rem',
                }}
              >
                {successMsg}
              </div>
            )}
            {error && (
              <div
                role="alert"
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--color-warning, #ef4444)',
                  color: 'var(--color-warning, #ef4444)',
                  fontSize: '0.82rem',
                }}
              >
                {error}
              </div>
            )}

            {/* Items Claiming List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Line items ({bill?.items?.length || 0})
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Tap to claim items you had
                </span>
              </div>

              {(bill?.items || []).map((item) => {
                const claims = item.claims || [];
                const myClaim = claims.find(
                  (c) =>
                    c.memberId?.toString() === currentMemberId ||
                    (c.userId && user?.id && c.userId.toString() === user.id.toString())
                );
                const myUnits = myClaim?.units || 0;
                const isClaimedByMe = myUnits > 0;
                const totalClaimedUnits = claims.reduce((s, c) => s + (Number(c.units) || 0), 0);
                const isItemFullyClaimed = totalClaimedUnits >= item.qty;
                const isBusy = claimingItemId === item._id;

                return (
                  <div
                    key={item._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md, 8px)',
                      border: isClaimedByMe
                        ? '1px solid var(--accent-primary, #6366F1)'
                        : '1px solid var(--border-color)',
                      background: isClaimedByMe
                        ? 'rgba(99, 102, 241, 0.05)'
                        : 'var(--bg-surface, #FFFFFF)',
                      gap: '12px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                          {item.name}
                        </span>
                        {item.qty > 1 && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: 'var(--border-color)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            ×{item.qty}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-primary, #6366F1)' }}>
                          {symbol}
                          {Number(item.price).toFixed(2)}
                        </span>
                        {item.qty > 1 && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            ({symbol}{(item.price / item.qty).toFixed(2)} each)
                          </span>
                        )}
                      </div>

                      {/* Claimants list */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                        {claims.length > 0 ? (
                          claims.map((c, cIdx) => (
                            <span
                              key={cIdx}
                              style={{
                                fontSize: '0.68rem',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: c.memberId?.toString() === currentMemberId
                                  ? 'rgba(99, 102, 241, 0.2)'
                                  : 'rgba(255, 255, 255, 0.08)',
                                color: c.memberId?.toString() === currentMemberId
                                  ? 'var(--accent-primary, #6366F1)'
                                  : 'var(--text-secondary)',
                                border: '1px solid var(--border-color)',
                              }}
                            >
                              {getMemberName(c.memberId)}
                              {item.qty > 1 && c.units ? ` (${c.units})` : ''}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            Unclaimed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Claim action */}
                    {!isFinalized && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {item.qty === 1 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={isClaimedByMe ? 'primary' : 'secondary'}
                            disabled={isBusy}
                            onClick={() => handleClaim(item._id, isClaimedByMe ? 0 : 1)}
                            aria-label={isClaimedByMe ? `Unclaim ${item.name}` : `Claim ${item.name}`}
                          >
                            {isBusy ? '…' : isClaimedByMe ? '✓ Claimed' : 'Claim'}
                          </Button>
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              overflow: 'hidden',
                            }}
                          >
                            <button
                              type="button"
                              disabled={isBusy || myUnits <= 0}
                              onClick={() => handleClaim(item._id, myUnits - 1)}
                              style={{
                                padding: '4px 8px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-primary)',
                                cursor: myUnits <= 0 ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem',
                              }}
                              aria-label={`Decrease units of ${item.name}`}
                            >
                              -
                            </button>
                            <span
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                background: 'var(--bg-surface-elevated, rgba(255,255,255,0.03))',
                                color: myUnits > 0 ? 'var(--accent-primary, #6366F1)' : 'var(--text-muted)',
                              }}
                            >
                              {myUnits}
                            </span>
                            <button
                              type="button"
                              disabled={isBusy || (isItemFullyClaimed && myUnits === 0)}
                              onClick={() => handleClaim(item._id, myUnits + 1)}
                              style={{
                                padding: '4px 8px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-primary)',
                                cursor: (isItemFullyClaimed && myUnits === 0) ? 'not-allowed' : 'pointer',
                                fontSize: '0.85rem',
                              }}
                              aria-label={`Increase units of ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Host Finalize Section */}
            {isHost && !isFinalized && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  background: 'var(--bg-surface-elevated, rgba(255,255,255,0.02))',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Host Controls
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {breakdown?.unclaimedTotal > 0
                      ? `⚠️ ${symbol}${breakdown.unclaimedTotal.toFixed(2)} in unclaimed items`
                      : '✓ All items claimed'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="unclaimed-policy-select" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Unclaimed items policy
                    </label>
                    <select
                      id="unclaimed-policy-select"
                      className="form-input"
                      style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                      value={unclaimedPolicy}
                      onChange={(e) => setUnclaimedPolicy(e.target.value)}
                    >
                      <option value="split_equally">Split equally among everyone</option>
                      <option value="host_absorbs">Host absorbs unclaimed</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label htmlFor="nonresponder-policy-select" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      Non-responders policy
                    </label>
                    <select
                      id="nonresponder-policy-select"
                      className="form-input"
                      style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                      value={nonResponderPolicy}
                      onChange={(e) => setNonResponderPolicy(e.target.value)}
                    >
                      <option value="split_among_non_responders">Split among non-responders</option>
                      <option value="split_equally">Split equally among everyone</option>
                      <option value="host_absorbs">Host absorbs</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={actionLoading}
                    onClick={handleFinalize}
                    style={{ flex: 1 }}
                  >
                    {actionLoading ? 'Finalizing…' : '✓ Finalize & Add Group Expense'}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={actionLoading}
                    onClick={handleCancelBill}
                  >
                    Cancel Bill
                  </Button>
                </div>
              </div>
            )}

            {/* Footer close button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default ItemClaimModal;
