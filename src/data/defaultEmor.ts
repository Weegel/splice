import { CampaignDefinition } from '../types/campaign';

const localCampaigns = import.meta.glob<CampaignDefinition>(
  '../../local/campaigns/campaign_campaign_splintered_paths_of_emor.json',
  { eager: true, import: 'default' }
);
const emorCampaignJson = Object.values(localCampaigns)[0];

export const EMOR_CAMPAIGN: CampaignDefinition | undefined = emorCampaignJson
  ? {
      ...emorCampaignJson,
      id: 'campaign_splintered_paths_of_emor',
      isCustom: false,
    }
  : undefined;