import Card from './Card.jsx';

/**
 * Refactored GlassCard -> Calm Ledger Card
 * Maintained for backwards compatibility across existing pages
 */
const GlassCard = ({ style, className = '', children, ...props }) => {
  return (
    <Card style={style} className={className} {...props}>
      {children}
    </Card>
  );
};

export default GlassCard;
