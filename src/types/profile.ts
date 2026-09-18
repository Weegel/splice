import { PlayerCollectionState } from '../services/splinterlandsApi';

export interface LocalPlayerProfile {
  id: string;
  name: string;
  createdAt: number;
  linkedUsername?: string;
  collection?: PlayerCollectionState;
}
