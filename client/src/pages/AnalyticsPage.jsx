import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../components/Card.jsx';
import api from '../api/axios.js';

const COLORS = ['#6366F1', '#10B981', '#F43F5E', '#F59E0B', '#818CF8', '#14B8A6'];
const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const formatBreakdownLabel = (key) =>
  key
    .replace(/Score$/i, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const gradeCopy = (grade) => {
  if (grade === 'A') return 'Excellent control. Keep protecting your savings rate.';
  if (grade === 'B') return 'Healthy overall. Improve the lowest score to move up.';
  if (grade === 'C') return 'Stable, but budgets or goals need more attention.';
  if (grade === 'D') return 'Needs attention. Start with one budget category.';
  return 'Add more income, expenses, budgets, and goals for a useful score.';
};

const Panel = ({ title, takeaway, subtitle, action, children, style }) => (
  <Card style={{ padding: '1.25rem 1.4rem', ...style }}>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '1rem',
        marginBottom: '1rem',
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {(takeaway || subtitle) && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {takeaway || subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
    {children}
  </Card>
);

const MetricCard = ({ label, value, helper, tone = 'neutral' }) => {
  const color =
    tone === 'good' ? 'var(--color-positive)' : tone === 'bad' ? 'var(--color-negative)' : 'var(--text-primary)';

  return (
    <Card style={{ padding: '1rem 1.15rem', minHeight: 110 }}>
      <div className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div className="num-tabular" style={{ marginTop: '0.4rem', fontSize: '1.45rem', fontWeight: 700, color }}>
        {value}
      </div>
      <div className="text-muted" style={{ marginTop: '0.3rem', fontSize: '0.76rem' }}>
        {helper}
      </div>
    </Card>
  );
};

const EmptyState = ({ children }) => (
  <div
    className="text-muted"
    style={{
      minHeight: 180,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      fontSize: '0.85rem',
      border: '1px dashed var(--border-color)',
      borderRadius: 'var(--radius-md, 12px)',
      background: 'var(--bg-surface-elevated)',
      padding: '1rem',
    }}
  >
    {children}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: 'var(--bg-surface-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: '0.7rem 0.85rem',
        color: 'var(--text-primary)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
        {label}
      </div>
      {payload.map((item) => (
        <div key={item.dataKey || item.name} className="num-tabular" style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
          <span style={{ color: item.color, marginRight: 6 }}>●</span>
          {item.name || item.dataKey}: {money(item.value)}
        </div>
      ))}
    </div>
  );
};

const AnalyticsPage = () => {
  const [health, setHealth] = useState(null);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [spendingPattern, setSpendingPattern] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [moodSpending, setMoodSpending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError('');
      try {
        const [healthRes, trendRes, catRes, patternRes, subRes, txRes] = await Promise.all([
          api.get('/analytics/health-score'),
          api.get('/analytics/monthly-trend'),
          api.get('/analytics/category-breakdown'),
          api.get('/analytics/spending-pattern'),
          api.get('/analytics/subscriptions'),
          api.get('/transactions?type=expense&limit=500&page=1'),
        ]);

        if (healthRes.data?.success) setHealth(healthRes.data.data);
        if (trendRes.data?.success) setMonthlyTrend(trendRes.data.data);
        if (catRes.data?.success) setCategoryBreakdown(catRes.data.data);
        if (patternRes.data?.success) setSpendingPattern(patternRes.data.data);
        if (subRes.data?.success) setSubscriptions(subRes.data.data);

        if (txRes.data?.success) {
          const byMood = (txRes.data.data.items || []).reduce(
            (acc, transaction) => {
              const key = transaction.mood || 'neutral';
              acc[key] = (acc[key] || 0) + transaction.amount;
              return acc;
            },
            { happy: 0, neutral: 0, stressed: 0 }
          );

          setMoodSpending(
            Object.entries(byMood).map(([mood, total]) => ({
              mood: mood.charAt(0).toUpperCase() + mood.slice(1),
              total,
            }))
          );
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  const monthlyChartData = useMemo(
    () =>
      monthlyTrend
        .map((item) => ({
          label: `${item.month}/${String(item.year).slice(-2)}`,
          sortKey: item.year * 100 + item.month,
          income: item.income || 0,
          expense: item.expense || 0,
          savings: (item.income || 0) - (item.expense || 0),
        }))
        .sort((a, b) => a.sortKey - b.sortKey),
    [monthlyTrend]
  );

  const categoryData = useMemo(
    () =>
      categoryBreakdown
        .map((item) => ({ category: item.category, total: item.total || 0 }))
        .sort((a, b) => b.total - a.total),
    [categoryBreakdown]
  );

  const categoryTotal = categoryData.reduce((sum, item) => sum + item.total, 0);
  const topCategory = categoryData[0];

  const spendingPatternData = useMemo(
    () =>
      DAY_ORDER.map((day) => ({
        day: day.slice(0, 3),
        fullDay: day,
        total: spendingPattern.find((item) => item.day === day)?.total || 0,
      })),
    [spendingPattern]
  );

  const busiestDay = spendingPatternData.reduce(
    (max, item) => (item.total > max.total ? item : max),
    { day: 'None', fullDay: 'None', total: 0 }
  );

  const moodTotal = moodSpending.reduce((sum, item) => sum + item.total, 0);
  const highestMood = moodSpending.reduce(
    (max, item) => (item.total > max.total ? item : max),
    { mood: 'None', total: 0 }
  );

  const totalIncome = health?.summary?.totalIncome || 0;
  const totalExpense = health?.summary?.totalExpense || 0;
  const netSavings = health?.summary?.savings || 0;
  const healthScore = health?.score ?? 0;
  const grade = health?.grade ?? '-';
  const scoreTone = healthScore >= 70 ? 'good' : healthScore >= 40 ? 'neutral' : 'bad';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem', paddingTop: '0.25rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.65rem' }}>Analytics</h1>
          <p className="text-muted" style={{ margin: '0.35rem 0 0', fontSize: '0.86rem' }}>
            A readable summary of health, trends, categories, moods, and recurring costs.
          </p>
        </div>
        <div
          className="badge badge-positive"
          style={{ alignSelf: 'center', textTransform: 'none', letterSpacing: 0 }}
        >
          Includes split shares synced to personal expenses
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '0.65rem 0.9rem',
            borderRadius: 12,
            background: 'rgba(255, 107, 107, 0.1)',
            color: 'var(--accent-red)',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.9rem' }}>
        <MetricCard
          label="Income this month"
          value={loading ? '-' : money(totalIncome)}
          helper="All income transactions in the current month"
          tone="good"
        />
        <MetricCard
          label="Spent this month"
          value={loading ? '-' : money(totalExpense)}
          helper="Manual expenses plus synced split shares"
          tone="bad"
        />
        <MetricCard
          label="Net savings"
          value={loading ? '-' : money(netSavings)}
          helper={netSavings >= 0 ? 'Income left after expenses' : 'Expenses are above income'}
          tone={netSavings >= 0 ? 'good' : 'bad'}
        />
        <MetricCard
          label="Top category"
          value={topCategory ? topCategory.category : '-'}
          helper={topCategory ? `${money(topCategory.total)} this month` : 'Add expenses to see this'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
        <Panel
          title="Financial Health"
          takeaway={`Grade ${grade} — ${gradeCopy(grade)}`}
          style={{ minHeight: 350 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', alignItems: 'center' }}>
            <div
              style={{
                width: 148,
                height: 148,
                borderRadius: '50%',
                background: `conic-gradient(var(--color-positive) ${healthScore * 3.6}deg, var(--border-color) 0deg)`,
                display: 'grid',
                placeItems: 'center',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  width: 118,
                  height: 118,
                  borderRadius: '50%',
                  background: 'var(--bg-surface-elevated)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  border: '1px solid var(--border-strong)',
                }}
              >
                <div className="num-tabular" style={{ fontSize: '2rem', fontWeight: 750, color: 'var(--text-primary)' }}>
                  {loading ? '-' : healthScore}
                </div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  out of 100
                </div>
                <div style={{ marginTop: '0.25rem', color: 'var(--color-positive)', fontSize: '0.8rem', fontWeight: 600 }}>
                  Grade {grade}
                </div>
              </div>
            </div>

            <div>
              <div
                style={{
                  color:
                    scoreTone === 'good'
                      ? 'var(--color-positive)'
                      : scoreTone === 'bad'
                      ? 'var(--color-negative)'
                      : 'var(--color-warning)',
                  fontWeight: 700,
                  marginBottom: '0.35rem',
                }}
              >
                {gradeCopy(grade)}
              </div>
              <p className="text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                Low sub-scores show where to improve first. For example, a low budget score means
                spending is crossing category limits.
              </p>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {health &&
              Object.entries(health.breakdown || {}).map(([key, value]) => (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span>{formatBreakdownLabel(key)}</span>
                    <span className="text-muted num-tabular">{value}/100</span>
                  </div>
                  <div
                    style={{
                      height: 7,
                      marginTop: '0.25rem',
                      borderRadius: 999,
                      background: 'var(--border-color)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, value))}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: value >= 70 ? 'var(--color-positive)' : value >= 40 ? 'var(--color-warning)' : 'var(--color-negative)',
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </Panel>

        <Panel
          title="Monthly Income vs Expense"
          takeaway={
            monthlyChartData.length > 0
              ? netSavings >= 0
                ? `Net surplus of ${money(netSavings)} saved this month`
                : `Net deficit of ${money(Math.abs(netSavings))} this month`
              : 'Add transactions to see your monthly comparison'
          }
          style={{ minHeight: 350 }}
        >
          {monthlyChartData.length === 0 ? (
            <EmptyState>Add income and expenses to see your monthly trend.</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={monthlyChartData} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="label" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} tickFormatter={money} width={68} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="income" name="Income (+)" stroke="#10B981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} animationDuration={250} />
                <Line type="monotone" dataKey="expense" name="Expense (−)" stroke="#F43F5E" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} animationDuration={250} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
        <Panel
          title="Category Breakdown"
          takeaway={
            topCategory
              ? `${topCategory.category} is your highest spend: ${money(topCategory.total)} (${categoryTotal > 0 ? ((topCategory.total / categoryTotal) * 100).toFixed(0) : 0}%)`
              : 'Where this month of spending is concentrated'
          }
          style={{ minHeight: 360 }}
        >
          {categoryData.length === 0 ? (
            <EmptyState>Add expense categories to see a breakdown.</EmptyState>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="total"
                    nameKey="category"
                    innerRadius={62}
                    outerRadius={100}
                    paddingAngle={3}
                    animationDuration={250}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={entry.category} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {categoryData.slice(0, 6).map((item, index) => {
                  const percent = categoryTotal > 0 ? (item.total / categoryTotal) * 100 : 0;
                  return (
                    <div key={item.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span>
                          <span style={{ color: COLORS[index % COLORS.length], marginRight: 6 }}>●</span>
                          {item.category}
                        </span>
                        <span className="num-tabular" style={{ fontWeight: 600 }}>{money(item.total)}</span>
                      </div>
                      <div className="text-muted num-tabular" style={{ fontSize: '0.74rem', marginTop: '0.1rem' }}>
                        {percent.toFixed(0)}% of tracked spending
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Mood vs Spending"
          takeaway={
            highestMood.total > 0
              ? `Highest spending occurred when feeling ${highestMood.mood} (${money(highestMood.total)})`
              : 'See whether certain spending is tied to emotion'
          }
          action={
            highestMood.total > 0 ? (
              <span className="badge badge-positive" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Peak: {highestMood.mood}
              </span>
            ) : null
          }
          style={{ minHeight: 360 }}
        >
          {moodTotal === 0 ? (
            <EmptyState>Add expenses with moods to see this pattern.</EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {moodSpending.map((item) => {
                const percent = moodTotal > 0 ? (item.total / moodTotal) * 100 : 0;
                const tone =
                  item.mood === 'Happy'
                    ? 'var(--color-positive)'
                    : item.mood === 'Stressed'
                    ? 'var(--color-negative)'
                    : 'var(--color-accent)';

                return (
                  <div key={item.mood}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem' }}>
                      <span>{item.mood}</span>
                      <strong className="num-tabular">{money(item.total)}</strong>
                    </div>
                    <div
                      style={{
                        height: 9,
                        marginTop: '0.35rem',
                        borderRadius: 999,
                        background: 'var(--border-color)',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: tone }} />
                    </div>
                    <div className="text-muted num-tabular" style={{ fontSize: '0.74rem', marginTop: '0.2rem' }}>
                      {percent.toFixed(0)}% of mood-tagged spending
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
        <Panel
          title="Spending by Day"
          takeaway={
            busiestDay.total > 0
              ? `Spending peaks on ${busiestDay.fullDay}s at ${money(busiestDay.total)}`
              : 'Which day of the week usually costs the most'
          }
          action={
            busiestDay.total > 0 ? (
              <span className="badge badge-positive" style={{ textTransform: 'none', letterSpacing: 0 }}>
                Peak: {busiestDay.fullDay}
              </span>
            ) : null
          }
          style={{ minHeight: 320 }}
        >
          {spendingPattern.every((item) => item.total === 0) ? (
            <EmptyState>Add dated expenses to see day-wise spending.</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={spendingPatternData} margin={{ top: 10, right: 18, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="day" stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} tickFormatter={money} width={68} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" name="Spent" fill="var(--color-accent)" radius={[6, 6, 0, 0]} animationDuration={250} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel
          title="Detected Subscriptions"
          takeaway={
            subscriptions.length > 0
              ? `${subscriptions.length} recurring services totaling ${money(subscriptions.reduce((sum, s) => sum + s.estimatedMonthlyCost, 0))}/month`
              : 'Repeated similar expenses from recent months'
          }
          style={{ minHeight: 320 }}
        >
          {loading ? (
            <EmptyState>Analysing recurring expenses...</EmptyState>
          ) : subscriptions.length === 0 ? (
            <EmptyState>No clear recurring subscriptions detected yet.</EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {subscriptions.map((subscription) => (
                <div
                  key={subscription.description}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    padding: '0.75rem 0',
                    borderBottom: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 650 }}>{subscription.description}</div>
                    <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: '0.15rem' }}>
                      {subscription.occurrences} similar charges detected
                    </div>
                  </div>
                  <div className="num-tabular" style={{ textAlign: 'right', color: 'var(--color-accent)', fontWeight: 700 }}>
                    {money(subscription.estimatedMonthlyCost)}
                    <div className="text-muted" style={{ fontSize: '0.72rem', fontWeight: 400 }}>
                      monthly est.
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default AnalyticsPage;
