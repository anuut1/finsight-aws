import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import GlassCard from '../GlassCard.jsx';

const LineChartWrapper = ({ title, data, dataKeyX, dataKeyY1, dataKeyY2, labelY1, labelY2 }) => {
  return (
    <GlassCard style={{ padding: '1rem 1.25rem', height: 280 }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>{title}</div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(156, 145, 159, 0.15)" />
          <XAxis dataKey={dataKeyX} stroke="var(--text-muted)" tickLine={false} axisLine={false} style={{ fontSize: '0.78rem' }} />
          <YAxis 
            stroke="var(--text-muted)" 
            tickLine={false} 
            axisLine={false} 
            style={{ fontSize: '0.78rem' }}
            width={75}
            tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--accent-primary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              color: 'var(--bg-primary)',
            }}
            itemStyle={{ color: 'var(--bg-primary)', fontSize: '0.82rem' }}
            labelStyle={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '0.25rem' }}
            formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, '']}
          />
          <Line type="monotone" dataKey={dataKeyY1} name={labelY1} stroke="#242548" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
          {dataKeyY2 && (
            <Line type="monotone" dataKey={dataKeyY2} name={labelY2} stroke="#C3AAA4" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};

export default LineChartWrapper;


