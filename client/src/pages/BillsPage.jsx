import BillsAndSubscriptionsCard from '../components/BillsAndSubscriptionsCard.jsx';

/**
 * Bills & Subscriptions Page
 *
 * Dedicated view for recurring obligations, subscriptions,
 * auto-pay status, and upcoming bill dates.
 */
const BillsPage = () => {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', paddingBottom: '4rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1
          style={{
            fontFamily: 'var(--font-heading, "Instrument Serif", serif)',
            fontSize: '2.5rem',
            fontWeight: 400,
            color: 'var(--text-primary)',
            margin: '0 0 0.5rem 0',
            letterSpacing: '-0.02em',
          }}
        >
          Bills & subscriptions
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Track recurring commitments, renewals, auto-pay schedules, and auto-detected subscriptions.
        </p>
      </div>

      <BillsAndSubscriptionsCard />
    </div>
  );
};

export default BillsPage;
