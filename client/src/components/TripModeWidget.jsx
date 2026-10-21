import { useState, useEffect } from 'react';
import api from '../api/axios';
import Modal from './Modal';
import Button from './Button';
import TripAddExpenseModal from './TripAddExpenseModal';
import UpiSettlementModal from './UpiSettlementModal';
import PayAndSplitModal from './PayAndSplitModal';

const CURRENCIES = [
  { code: 'INR', symbol: '₹', label: 'INR (₹)' },
  { code: 'USD', symbol: '$', label: 'USD ($)' },
  { code: 'EUR', symbol: '€', label: 'EUR (€)' },
  { code: 'GBP', symbol: '£', label: 'GBP (£)' },
  { code: 'AED', symbol: 'د.إ', label: 'AED (د.إ)' },
  { code: 'SGD', symbol: 'S$', label: 'SGD (S$)' },
  { code: 'THB', symbol: '฿', label: 'THB (฿)' },
];

const getCurrencySymbol = (code) => {
  const match = CURRENCIES.find((c) => c.code === (code || '').toUpperCase());
  return match ? match.symbol : '₹';
};

const TripModeWidget = ({ onTripChanged }) => {
  const [activeTrip, setActiveTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [endModalOpen, setEndModalOpen] = useState(false);
  const [endedSummary, setEndedSummary] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Start trip form state
  const [tripName, setTripName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [membersInput, setMembersInput] = useState('Aman, Riya');

  // Settlement inline state
  const [settlingDebt, setSettlingDebt] = useState(null);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [payAndSplitOpen, setPayAndSplitOpen] = useState(false);
  const [upiModalOpen, setUpiModalOpen] = useState(false);
  const [upiDebt, setUpiDebt] = useState(null);
  const [friends, setFriends] = useState([]);

  const fetchActiveTrip = async () => {
    try {
      const res = await api.get('/splits/trips/active');
      if (res.data?.success) {
        setActiveTrip(res.data.data);
      }
    } catch (err) {
      console.warn('Could not fetch active trip:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchFriends = async () => {
    try {
      const res = await api.get('/friends');
      if (res.data?.success) {
        setFriends(res.data.data || []);
      }
    } catch (err) {
      console.warn('Could not load friends:', err.message);
    }
  };

  useEffect(() => {
    fetchActiveTrip();
    fetchFriends();
  }, []);

  const toggleFriendInTrip = (friend) => {
    const currentNames = membersInput
      .split(/,|\n/)
      .map((m) => m.trim())
      .filter(Boolean);
    const existsIndex = currentNames.findIndex(
      (m) => m.toLowerCase() === friend.name.toLowerCase()
    );
    if (existsIndex >= 0) {
      currentNames.splice(existsIndex, 1);
    } else {
      currentNames.push(friend.name);
    }
    setMembersInput(currentNames.join(', '));
  };

  const handleStartTrip = async (e) => {
    e.preventDefault();
    if (!tripName.trim()) {
      setError('Please enter a trip name.');
      return;
    }

    const rawMembers = membersInput
      .split(/,|\n/)
      .map((m) => m.trim())
      .filter(Boolean);

    if (rawMembers.length < 1) {
      setError('Please provide at least one friend or trip partner.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const membersPayload = rawMembers.map((name) => {
        const matched = friends.find(
          (f) => f.name.toLowerCase() === name.toLowerCase()
        );
        return {
          name,
          email: matched?.email || undefined,
          userId: matched?.userId || undefined,
        };
      });
      const res = await api.post('/splits/trips/start', {
        name: tripName.trim(),
        currency,
        members: membersPayload,
      });

      if (res.data?.success) {
        setActiveTrip(res.data.data);
        setStartModalOpen(false);
        setTripName('');
        setMembersInput('Aman, Riya');
        if (onTripChanged) onTripChanged(res.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start trip mode');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndTrip = async () => {
    if (!activeTrip) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await api.post(`/splits/trips/${activeTrip._id}/end`);
      if (res.data?.success) {
        setEndedSummary(res.data.data);
        setActiveTrip(null);
        setEndModalOpen(true);
        if (onTripChanged) onTripChanged(null);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to end trip');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordSettlement = async (debt) => {
    const tripId = activeTrip?._id || endedSummary?._id;
    if (!tripId) return;

    setSettlingDebt(debt.from + debt.to);
    try {
      const res = await api.post(`/splits/groups/${tripId}/settlements`, {
        from: debt.from,
        to: debt.to,
        amount: debt.amount,
        date: new Date().toISOString().slice(0, 10),
        note: `Settled via Trip Mode summary`,
      });

      if (res.data?.success) {
        // Refetch summary or update modal view
        const sumRes = await api.get(`/splits/trips/${tripId}/summary`);
        if (sumRes.data?.success) {
          if (activeTrip) setActiveTrip(sumRes.data.data);
          if (endedSummary) setEndedSummary(sumRes.data.data);
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Could not record settlement');
    } finally {
      setSettlingDebt(null);
    }
  };

  const handleCopySummary = () => {
    const summaryData = endedSummary?.tripSummary || activeTrip?.tripSummary;
    const name = endedSummary?.name || activeTrip?.name || 'Trip';
    if (!summaryData) return;

    const sym = getCurrencySymbol(summaryData.currency);
    const debtsText =
      summaryData.simplifiedDebts?.length > 0
        ? summaryData.simplifiedDebts
            .map((d) => `• ${d.fromName} owes ${d.toName}: ${sym}${d.amount.toLocaleString()}`)
            .join('\n')
        : '• All settled up! No outstanding balances.';

    const text = `✈️ FinSight Trip Summary: ${name}
Total Spend: ${sym}${summaryData.totalSpend?.toLocaleString()}
Fair Share: ${sym}${summaryData.perPersonFairShare?.toLocaleString()} / person

⚖️ Who Owes Whom:
${debtsText}

Calculated via FinSight`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  if (loading) return null;

  const currentSummary = activeTrip?.tripSummary;
  const sym = getCurrencySymbol(currentSummary?.currency || activeTrip?.currency || 'INR');

  return (
    <>
      {/* ======================================================== */}
      {/* 1. Trip Mode Active Banner OR Inactive Trigger Card      */}
      {/* ======================================================== */}
      {activeTrip ? (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(16, 185, 129, 0.1) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: 'var(--radius-xl)',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem',
                boxShadow: '0 0 12px rgba(99, 102, 241, 0.5)',
              }}
            >
              ✈️
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                  {activeTrip.name}
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: 'var(--accent-success)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                  }}
                >
                  Trip Mode Active
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: 'var(--accent-primary-light)',
                  }}
                >
                  {activeTrip.currency}
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  marginTop: '0.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <span>
                  👥 <strong>{activeTrip.members?.length || 0}</strong> members (
                  {activeTrip.members?.map((m) => m.name).join(', ')})
                </span>
                <span>•</span>
                <span>
                  💳 Total Spent:{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {sym}
                    {(currentSummary?.totalSpend || 0).toLocaleString()}
                  </strong>
                </span>
                <span>•</span>
                <span style={{ color: 'var(--accent-primary-light)' }}>
                  ⚡ New expenses auto-tagged & split
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Button size="sm" variant="primary" onClick={() => setPayAndSplitOpen(true)}>⚡ Pay & Split</Button>
            <Button size="sm" variant="secondary" onClick={() => setAddExpenseOpen(true)}>+ Add expense</Button>
            <Button size="sm" variant="secondary" onClick={() => { setEndedSummary(activeTrip); setEndModalOpen(true); }}>Settle up</Button>
            <Button size="sm" variant="danger" onClick={handleEndTrip} loading={submitting}>End trip</Button>
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '0.75rem 1.15rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.2rem' }}>✈️</span>
            <div>
              <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                Planning a trip or vacation?
              </span>
              <span
                className="text-muted"
                style={{ fontSize: '0.78rem', marginLeft: '0.5rem', display: 'inline-block' }}
              >
                Start Trip Mode to auto-tag new expenses with preset members & get simplified who-owes-whom settlements.
              </span>
            </div>
          </div>
          <Button size="sm" onClick={() => setStartModalOpen(true)}>+ Start trip mode</Button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. Start Trip Modal                                      */}
      {/* ======================================================== */}
      <Modal
        title="✈️ Start Trip Mode"
        isOpen={startModalOpen}
        onClose={() => !submitting && setStartModalOpen(false)}
      >
        <form onSubmit={handleStartTrip}>
          <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '1rem', marginTop: 0 }}>
            Configure your trip preset once. While Trip Mode is active, all new entries will automatically
            tag to this group and split equally with preset members.
          </p>

          {error && (
            <div
              style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--accent-danger)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                marginBottom: '0.85rem',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                TRIP NAME
              </label>
              <input
                type="text"
                className="input-glass"
                placeholder="e.g. Goa Vacation, Manali Trek, Europe 2026"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  CURRENCY
                </label>
                <select
                  className="input-glass"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: '4px' }}>
                  PRESET TRIP MEMBERS (comma-separated)
                </label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="e.g. Aman, Riya, Kunal"
                  value={membersInput}
                  onChange={(e) => setMembersInput(e.target.value)}
                />
                {friends.length > 0 && (
                  <div style={{ marginTop: '0.35rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      One-tap add:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.2rem' }}>
                      {friends.map((friend) => {
                        const isSelected = membersInput
                          .split(/,|\n/)
                          .map((m) => m.trim().toLowerCase())
                          .includes(friend.name.toLowerCase());
                        return (
                          <button
                            key={friend.userId}
                            type="button"
                            onClick={() => toggleFriendInTrip(friend)}
                            style={{
                              padding: '0.15rem 0.5rem',
                              borderRadius: '999px',
                              fontSize: '0.72rem',
                              border: isSelected
                                ? '1px solid var(--accent-primary, #6366F1)'
                                : '1px solid var(--border-color)',
                              background: isSelected
                                ? 'rgba(99, 102, 241, 0.15)'
                                : 'rgba(255, 255, 255, 0.05)',
                              color: isSelected ? 'var(--accent-primary, #6366F1)' : 'var(--text-primary)',
                              cursor: 'pointer',
                            }}
                          >
                            {isSelected ? '✓ ' : '+ '}
                            {friend.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                padding: '0.65rem 0.85rem',
                background: 'rgba(99, 102, 241, 0.08)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}
            >
              💡 <em>Note:</em> You are automatically added as the trip host/payer. When you add expenses,
              they will be split equally among all preset members.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
            <Button variant="secondary" onClick={() => setStartModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={submitting}>Start trip mode</Button>
          </div>
        </form>
      </Modal>

      {/* ======================================================== */}
      {/* 3. Simplified "Who Owes Whom" Settlement Summary Modal   */}
      {/* ======================================================== */}
      <Modal
        title={`🏁 Trip Settlement Summary: ${endedSummary?.name || 'Trip'}`}
        isOpen={endModalOpen}
        onClose={() => setEndModalOpen(false)}
      >
        <div>
          {/* Top KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.65rem',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '0.65rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                border: '1px solid var(--border-color)',
              }}
            >
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Total Spend</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {getCurrencySymbol(endedSummary?.tripSummary?.currency)}
                {(endedSummary?.tripSummary?.totalSpend || 0).toLocaleString()}
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '0.65rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                border: '1px solid var(--border-color)',
              }}
            >
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Fair Share / Person</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent-primary-light)' }}>
                {getCurrencySymbol(endedSummary?.tripSummary?.currency)}
                {(endedSummary?.tripSummary?.perPersonFairShare || 0).toLocaleString()}
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '0.65rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
                border: '1px solid var(--border-color)',
              }}
            >
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Expenses Logged</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {endedSummary?.tripSummary?.expensesCount || endedSummary?.expenses?.length || 0}
              </div>
            </div>
          </div>

          {/* Simplified "Who Owes Whom" Section */}
          <div style={{ marginBottom: '1rem' }}>
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>⚖️ Simplified Settlements (Who Owes Whom)</span>
              <span className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 400 }}>
                Minimized debt transactions
              </span>
            </div>

            {endedSummary?.simplifiedDebts?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {endedSummary.simplifiedDebts.map((debt, index) => {
                  const symCode = getCurrencySymbol(endedSummary?.tripSummary?.currency);
                  const isSettling = settlingDebt === debt.from + debt.to;

                  return (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--accent-danger)' }}>{debt.fromName}</span>
                        <span className="text-muted">owes</span>
                        <span style={{ fontWeight: 600, color: 'var(--accent-success)' }}>{debt.toName}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {symCode}
                          {debt.amount.toLocaleString()}
                        </span>

                        {(!endedSummary?.tripSummary?.currency || endedSummary?.tripSummary?.currency === 'INR') && (
                          <button
                            type="button"
                            onClick={() => {
                              setUpiDebt(debt);
                              setUpiModalOpen(true);
                            }}
                            title="Open UPI QR / deep-link"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '5px 8px',
                              background: 'linear-gradient(135deg, #10B981, #059669)',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: 'var(--radius-sm, 8px)',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            ⚡ UPI
                          </button>
                        )}

                        <Button size="sm" onClick={() => handleRecordSettlement(debt)} loading={isSettling}>Settle</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  textAlign: 'center',
                  color: 'var(--accent-success)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                🎉 All settled up! No outstanding balances for this trip.
              </div>
            )}
          </div>

          {/* Member Individual Net Balances */}
          {endedSummary?.tripSummary?.memberContributions && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                MEMBER BREAKDOWN
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.4rem' }}>
                {endedSummary.tripSummary.memberContributions.map((m) => {
                  const symCode = getCurrencySymbol(endedSummary?.tripSummary?.currency);
                  const isPositive = m.netBalance >= 0;

                  return (
                    <div
                      key={m.memberId}
                      style={{
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.75rem',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</div>
                      <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                        Paid: {symCode}{m.totalPaid.toLocaleString()}
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          color: isPositive ? 'var(--accent-success)' : 'var(--accent-danger)',
                          marginTop: '2px',
                        }}
                      >
                        {isPositive ? `+${symCode}${m.netBalance}` : `-${symCode}${Math.abs(m.netBalance)}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bottom Actions: Copy Summary & Done */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--divider-color)',
            }}
          >
            <Button variant="secondary" onClick={handleCopySummary}>{copied ? 'Copied' : 'Copy summary'}</Button>
            <Button onClick={() => setEndModalOpen(false)}>Done</Button>
          </div>
        </div>
      </Modal>

      <TripAddExpenseModal
        isOpen={addExpenseOpen}
        onClose={() => setAddExpenseOpen(false)}
        trip={activeTrip}
        symbol={sym}
        onAdded={() => { fetchActiveTrip(); if (onTripChanged) onTripChanged(activeTrip); }}
      />

      <PayAndSplitModal
        isOpen={payAndSplitOpen}
        onClose={() => setPayAndSplitOpen(false)}
        trip={activeTrip}
        onDraftCreated={() => {
          fetchActiveTrip();
          if (onTripChanged) onTripChanged(activeTrip);
        }}
      />

      <UpiSettlementModal
        isOpen={upiModalOpen}
        onClose={() => setUpiModalOpen(false)}
        debt={upiDebt}
        groupId={activeTrip?._id || endedSummary?._id}
        groupName={activeTrip?.name || endedSummary?.name || 'Trip'}
        onSettled={async () => {
          const tripId = activeTrip?._id || endedSummary?._id;
          if (!tripId) return;
          try {
            const sumRes = await api.get(`/splits/trips/${tripId}/summary`);
            if (sumRes.data?.success) {
              if (activeTrip) setActiveTrip(sumRes.data.data);
              if (endedSummary) setEndedSummary(sumRes.data.data);
            }
          } catch (e) {
            console.warn('Could not refresh trip summary:', e);
          }
        }}
      />
    </>
  );
};

export default TripModeWidget;
