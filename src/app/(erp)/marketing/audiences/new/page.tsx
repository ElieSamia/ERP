import { EMPTY_FILTER } from '@/lib/marketing';
import { AudienceEditor } from '@/components/AudienceEditor';

export default function NewAudience() {
  return <AudienceEditor empty={EMPTY_FILTER} />;
}
