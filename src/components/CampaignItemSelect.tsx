import { CampaignItemDefinition } from '../types/campaign';

interface CampaignItemSelectProps {
  items: CampaignItemDefinition[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function CampaignItemSelect({ items, value, onChange, className, ariaLabel }: CampaignItemSelectProps) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel} className={className}>
      <option value="">Select campaign item</option>
      {value && !items.some((item) => item.name === value) && <option value={value} disabled>{value} (Unregistered)</option>}
      {items.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
    </select>
  );
}