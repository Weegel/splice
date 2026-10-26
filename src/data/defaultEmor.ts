import { CampaignDefinition } from '../types/campaign';
import emorCampaignJson from '../../local/campaigns/campaign_campaign_custom_1791371731769.json';

export const EMOR_CAMPAIGN: CampaignDefinition = {
  ...(emorCampaignJson as unknown as CampaignDefinition),
  id: 'campaign_custom_1791371731769',
  isCustom: false,
};