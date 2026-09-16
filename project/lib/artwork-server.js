import { query } from './db';
import * as gateway from './paymentGateway';
import { createArtworkService } from './artwork-orders.mjs';

export const artworkService = createArtworkService({ query, provider: { ...gateway, mode: gateway.razorpayMode } });
