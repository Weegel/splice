import { CampaignDefinition } from '../types/campaign';
import emorCampaignJson from '../../local/campaigns/campaign_campaign_splintered_paths_of_emor.json';

export const EMOR_CAMPAIGN: CampaignDefinition = {
  ...(emorCampaignJson as unknown as CampaignDefinition),
  id: 'campaign_splintered_paths_of_emor',
  isCustom: false,
};