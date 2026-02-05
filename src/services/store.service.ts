import { RedEventStore } from '@nostr/gadgets/redstore'
import RedStoreWorker from '@nostr/gadgets/redstore/redstore-worker?worker'

export const store = new RedEventStore(new RedStoreWorker())
