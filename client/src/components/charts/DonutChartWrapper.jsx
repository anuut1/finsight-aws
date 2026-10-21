import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import GlassCard from '../GlassCard.jsx';

const COLORS = ['#242548', '#525577', '#9C919F', '#C3AAA4'];

const DonutChartWrapper = ({ title, data, dataKeyName, dataKeyValue }) => {
  return (
    <GlassCard style={{ padding: '1rem 1.25rem', height: 260 }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600 }}>{title}</div>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey={dataKeyValue}
            nameKey={dataKeyName}
            innerRadius={60}
            outerRadius={90}
            paddingAngle={4}
          >
            {data.map((entry, index) => (
              <Cell key={entry[dataKeyName]} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--accent-primary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              color: 'var(--bg-primary)',
            }}
            itemStyle={{ color: 'var(--bg-primary)', fontSize: '0.82rem' }}
            formatter={(value) => [`₹${Number(value).toLocaleString('en-IN')}`, '']}
          />
        </PieChart>
      </ResponsiveContainer>
    </GlassCard>
  );
};

export default DonutChartWrapper;


