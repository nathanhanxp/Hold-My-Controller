"use client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { ReactNode } from "react";
import { IdentityProvider } from "./identity";
import { AssistantProvider } from "./assistant/Assistant";
import "@solana/wallet-adapter-react-ui/styles.css";

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

/** Wallets come from the Wallet Standard (Phantom, Solflare, Backpack register themselves). Devnet only. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <IdentityProvider>
      <ConnectionProvider endpoint={RPC}>
        <WalletProvider wallets={[]} autoConnect={false}>
          <WalletModalProvider><AssistantProvider>{children}</AssistantProvider></WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </IdentityProvider>
  );
}
