// src/tensorMarketplace.ts
import {
  ApolloClient,
  InMemoryCache,
  gql,
  HttpLink,
  ApolloLink,
  concat,
} from "@apollo/client/core";
import fetch from "cross-fetch";
import BN from "bn.js";
import { NFTListing, NFTBid } from "./types";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";

// --- Apollo Client Setup for Tensor ---
const authLink = new ApolloLink((operation, forward) => {
  operation.setContext({
    headers: {
      "X-TENSOR-API-KEY": config.tensorApiKey || "",
    },
  });
  return forward(operation);
});

// CORRECTED: The GraphQL endpoint is api.tensor.so/graphql
const httpLink = new HttpLink({ uri: "https://api.tensor.so/graphql", fetch } );

const client = new ApolloClient({
  link: concat(authLink, httpLink ),
  cache: new InMemoryCache(),
  defaultOptions: {
    query: {
      fetchPolicy: "no-cache",
    },
    watchQuery: {
      fetchPolicy: "no-cache",
    },
  },
});

// --- GraphQL Queries ---
const GET_COLLECTION_LISTINGS_QUERY = gql`
  query ActiveListingsV2($slug: String!) {
    activeListingsV2(slug: $slug, sortBy: PriceAsc) {
      txs {
        mint
        txId
        grossAmount
        seller
      }
    }
  }
`;

const GET_COLLECTION_BIDS_QUERY = gql`
  query TcompBids($slug: String!) {
    tcompBids(slug: $slug) {
      bids {
        mint
        price
        bidder
      }
    }
  }
`;

// --- Fetch Functions ---
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    const { data } = await client.query({
      query: GET_COLLECTION_LISTINGS_QUERY,
      variables: { slug: collectionId },
    });

    if (!data || !data.activeListingsV2) {
      return [];
    }

    const now = Date.now();
    return data.activeListingsV2.txs.map((item: any) => ({
      mint: item.mint,
      auctionHouse: "Tensor",
      price: new BN(item.grossAmount), // Price is already in lamports
      assetMint: item.mint,
      currency: "SOL",
      timestamp: now,
      sellerPubkey: item.seller,
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, {
      message: `Tensor fetchListings error for collection ${collectionId}`,
      source: "Tensor",
      collection: collectionId,
    });
    return [];
  }
}

export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  try {
    const { data } = await client.query({
      query: GET_COLLECTION_BIDS_QUERY,
      variables: { slug: collectionId },
    });

    if (!data || !data.tcompBids) {
      return [];
    }

    const now = Date.now();
    // Tensor component bids are collection-wide
    return data.tcompBids.map((bid: any) => ({
      mint: collectionId, // This is a collection bid
      auctionHouse: "Tensor",
      price: new BN(bid.price), // Price is in lamports
      assetMint: "So11111111111111111111111111111111111111112",
      currency: "SOL",
      timestamp: now,
      bidderPubkey: bid.bidder,
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, {
      message: `Tensor fetchBids error for collection ${collectionId}`,
      source: "Tensor",
      collection: collectionId,
    });
    return [];
  }
}
