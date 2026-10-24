import { describeDataAdapterContract } from './contract/dataAdapterContract';
import { MockAdapter } from '../src/data/MockAdapter';

describeDataAdapterContract('MockAdapter', () => new MockAdapter());
