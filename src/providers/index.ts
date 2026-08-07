import { Provider } from '../types';
import { MockRSSProvider } from './mockRssProvider';

export const providers: Provider[] = [
  new MockRSSProvider(),
];
