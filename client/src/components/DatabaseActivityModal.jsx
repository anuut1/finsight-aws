import { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import api from '../api/axios.js';

const DatabaseActivityModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      api.get('/auth/database-info').catch(() => null),
      api.get('/auth/activity').catch(() => null),
    ])
      .then(([infoRes, actRes]) => {
        if (!mounted) return;
        if (infoRes?.data?.success) {
          setInfo(infoRes.data);
        }
        if (actRes?.data?.success) {
          setActivities(actRes.data.data || []);
        }
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Failed to fetch database information');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Amazon DynamoDB & User Activity Center">
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color, #1E293B)', paddingBottom: '12px', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          style={{
            background: activeTab === 'summary' ? 'var(--accent-color, #4F46E5)' : 'transparent',
            color: activeTab === 'summary' ? '#FFFFFF' : 'var(--text-secondary, #94A3B8)',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          Database & Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('subscriptions')}
          style={{
            background: activeTab === 'subscriptions' ? 'var(--accent-color, #4F46E5)' : 'transparent',
            color: activeTab === 'subscriptions' ? '#FFFFFF' : 'var(--text-secondary, #94A3B8)',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          Subscriptions ({info?.userSummary?.subscriptions?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          style={{
            background: activeTab === 'activity' ? 'var(--accent-color, #4F46E5)' : 'transparent',
            color: activeTab === 'activity' ? '#FFFFFF' : 'var(--text-secondary, #94A3B8)',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          Access & Audit Logs ({activities.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading DynamoDB telemetry...
        </div>
      ) : error ? (
        <div style={{ padding: '1rem', color: '#EF4444' }}>{error}</div>
      ) : (
        <div>
          {/* TAB 1: SUMMARY */}
          {activeTab === 'summary' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.9rem' }}>
              <div style={{ padding: '12px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#818CF8', fontSize: '0.95rem' }}>Active AWS Database</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px', color: 'var(--text-primary)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Engine:</span>
                  <strong>{info?.database?.engine || 'Amazon DynamoDB'}</strong>

                  <span style={{ color: 'var(--text-secondary)' }}>Core Table:</span>
                  <code>{info?.database?.table || 'finsight-core-prod'}</code>

                  <span style={{ color: 'var(--text-secondary)' }}>Ephemeral Table:</span>
                  <code>{info?.database?.secondaryTable || 'finsight-ephemeral-prod'}</code>

                  <span style={{ color: 'var(--text-secondary)' }}>Billing Mode:</span>
                  <span>{info?.database?.billingMode || 'Pay-per-request (On-Demand)'}</span>

                  <span style={{ color: 'var(--text-secondary)' }}>Monthly Cost:</span>
                  <span style={{ color: '#10B981' }}>{info?.database?.costEstimate || '$0.00 / month (AWS Free Tier)'}</span>
                </div>
              </div>

              <div style={{ padding: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid var(--border-color, #1E293B)' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Account Metadata</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Account Created:</span>
                  <span>
                    {info?.userSummary?.accountCreatedAt
                      ? new Date(info.userSummary.accountCreatedAt).toLocaleString('en-IN')
                      : 'Earlier via registration'}
                  </span>

                  <span style={{ color: 'var(--text-secondary)' }}>User Identifier:</span>
                  <code>{info?.userSummary?.userId}</code>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SUBSCRIPTIONS */}
          {activeTab === 'subscriptions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(!info?.userSummary?.subscriptions || info.userSummary.subscriptions.length === 0) ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No active subscriptions detected yet. Any payment containing "Netflix", "Spotify", "Prime", etc., is automatically detected and scheduled here.
                </div>
              ) : (
                info.userSummary.subscriptions.map((sub, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px 14px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color, #1E293B)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{sub.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Renewal: <strong>{new Date(sub.nextDueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</strong> • Frequency: {sub.frequency}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, color: 'var(--accent-color, #818CF8)' }}>₹{sub.amount}</div>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: sub.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: sub.status === 'active' ? '#10B981' : '#EF4444',
                        }}
                      >
                        {sub.status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: ACCESS & AUDIT LOGS */}
          {activeTab === 'activity' && (
            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activities.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No activity logs recorded yet.
                </div>
              ) : (
                activities.map((act, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #1E293B)',
                      fontSize: '0.85rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background:
                            act.action === 'ACCOUNT_CREATED'
                              ? 'rgba(99, 102, 241, 0.2)'
                              : act.action === 'USER_LOGIN'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : act.action === 'SUBSCRIPTION_DETECTED'
                              ? 'rgba(234, 179, 8, 0.2)'
                              : 'rgba(148, 163, 184, 0.2)',
                          color:
                            act.action === 'ACCOUNT_CREATED'
                              ? '#818CF8'
                              : act.action === 'USER_LOGIN'
                              ? '#10B981'
                              : act.action === 'SUBSCRIPTION_DETECTED'
                              ? '#FACC15'
                              : '#CBD5E1',
                          marginBottom: '4px',
                        }}
                      >
                        {act.action}
                      </span>
                      {act.details && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {act.details.serviceName && `App: ${act.details.serviceName} • `}
                          {act.details.amount && `Amount: ₹${act.details.amount} • `}
                          {act.ip && `IP: ${act.ip} • `}
                          {act.details.email && `Email: ${act.details.email}`}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(act.timestamp).toLocaleString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default DatabaseActivityModal;
