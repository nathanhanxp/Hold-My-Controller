//! ForkLab program (devnet only).
//!
//! 1. License payouts: each published mechanic registers its graph hash and an author split (bps).
//!    A license is one atomic transaction: platform fee, then every author's share, remainder to the first author.
//! 2. Challenge escrow: a creator deposits a prize pool; after the end the platform authority settles it
//!    with a payout list in bps (computed off-chain by the published flattenPayout from a public snapshot,
//!    whose hash is stored here). The creator can reclaim an unsettled pool after a 7 day grace period.
//!
//! Patterns follow BlinkBounties' Anchor 0.32 program: PDA seeds, INIT_SPACE, checked math,
//! system-program CPI transfers for user funds, direct lamport moves out of program-owned escrow.

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

declare_id!("Fork1abXXWq9pVRLz5u4Ep6ufJmrcg9F4cY9Hy4F6Kj");

pub const MAX_AUTHORS: usize = 8;
pub const MAX_WINNERS: usize = 12;
pub const TOTAL_BPS: u32 = 10_000;
pub const MAX_FEE_BPS: u16 = 2_000;
pub const REFUND_GRACE_SECS: i64 = 7 * 24 * 60 * 60;

#[program]
pub mod forklab {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16, fee_wallet: Pubkey) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, ForkError::FeeTooHigh);
        let c = &mut ctx.accounts.config;
        c.authority = ctx.accounts.authority.key();
        c.fee_wallet = fee_wallet;
        c.fee_bps = fee_bps;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn register_mechanic(
        ctx: Context<RegisterMechanic>,
        graph_hash: [u8; 32],
        parent_hash: [u8; 32],
        price_lamports: u64,
        authors: Vec<AuthorShare>,
    ) -> Result<()> {
        require!(!authors.is_empty() && authors.len() <= MAX_AUTHORS, ForkError::BadAuthors);
        let mut sum: u32 = 0;
        for (i, a) in authors.iter().enumerate() {
            require!(a.bps > 0, ForkError::BadShares);
            for b in authors.iter().skip(i + 1) {
                require_keys_neq!(a.wallet, b.wallet, ForkError::BadAuthors);
            }
            sum = sum.checked_add(a.bps as u32).ok_or(ForkError::Math)?;
        }
        require!(sum == TOTAL_BPS, ForkError::BadShares);
        let m = &mut ctx.accounts.mechanic;
        m.graph_hash = graph_hash;
        m.parent_hash = parent_hash;
        m.price_lamports = price_lamports;
        m.authors = authors;
        m.license_count = 0;
        m.bump = ctx.bumps.mechanic;
        Ok(())
    }

    pub fn license<'info>(ctx: Context<'_, '_, 'info, 'info, License<'info>>) -> Result<()> {
        let price = ctx.accounts.mechanic.price_lamports;
        require!(price > 0, ForkError::FreeMechanic);
        let authors = ctx.accounts.mechanic.authors.clone();
        require!(ctx.remaining_accounts.len() == authors.len(), ForkError::BadAccounts);
        let bps: Vec<u16> = authors.iter().map(|a| a.bps).collect();
        let (fee, amounts) = split_license(price, ctx.accounts.config.fee_bps, &bps)?;

        let system = ctx.accounts.system_program.to_account_info();
        let buyer = ctx.accounts.buyer.to_account_info();
        if fee > 0 {
            pay(&system, &buyer, &ctx.accounts.fee_wallet.to_account_info(), fee)?;
        }
        for (i, a) in authors.iter().enumerate() {
            let to = &ctx.remaining_accounts[i];
            require_keys_eq!(to.key(), a.wallet, ForkError::BadAccounts);
            require!(to.is_writable, ForkError::BadAccounts);
            if amounts[i] > 0 {
                pay(&system, &buyer, to, amounts[i])?;
            }
        }
        let m = &mut ctx.accounts.mechanic;
        m.license_count = m.license_count.checked_add(1).ok_or(ForkError::Math)?;
        let r = &mut ctx.accounts.license_record;
        r.buyer = ctx.accounts.buyer.key();
        r.paid = price;
        r.bump = ctx.bumps.license_record;
        emit!(Licensed { graph_hash: m.graph_hash, buyer: r.buyer, price, fee });
        Ok(())
    }

    pub fn create_challenge(
        ctx: Context<CreateChallenge>,
        challenge_id: u64,
        kind: ChallengeKind,
        ends_at: i64,
        max_winners: u8,
        pool_lamports: u64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(ends_at > now, ForkError::TooEarly);
        require!(max_winners >= 1 && (max_winners as usize) <= MAX_WINNERS, ForkError::BadSplit);
        let c = &mut ctx.accounts.challenge;
        c.challenge_id = challenge_id;
        c.creator = ctx.accounts.creator.key();
        c.kind = kind;
        c.ends_at = ends_at;
        c.max_winners = max_winners;
        c.status = ChallengeStatus::Open;
        c.snapshot_hash = [0u8; 32];
        c.bump = ctx.bumps.challenge;
        if pool_lamports > 0 {
            system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.to_account_info(), Transfer { from: ctx.accounts.creator.to_account_info(), to: ctx.accounts.challenge.to_account_info() }),
                pool_lamports,
            )?;
        }
        Ok(())
    }

    pub fn settle<'info>(ctx: Context<'_, '_, 'info, 'info, Settle<'info>>, snapshot_hash: [u8; 32], payout_bps: Vec<u16>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &mut ctx.accounts.challenge;
        require!(c.status == ChallengeStatus::Open, ForkError::NotOpen);
        require!(now >= c.ends_at, ForkError::TooEarly);
        let n = payout_bps.len();
        require!(n >= 1 && n <= c.max_winners as usize && n <= MAX_WINNERS, ForkError::BadSplit);
        require!(ctx.remaining_accounts.len() == n, ForkError::BadAccounts);
        let total: u32 = payout_bps.iter().map(|b| *b as u32).sum();
        require!(total == TOTAL_BPS, ForkError::BadSplit);
        for i in 0..n {
            require!(ctx.remaining_accounts[i].is_writable, ForkError::BadAccounts);
            for j in (i + 1)..n {
                require_keys_neq!(ctx.remaining_accounts[i].key(), ctx.remaining_accounts[j].key(), ForkError::DuplicateRecipient);
            }
        }
        let info = c.to_account_info();
        let floor = Rent::get()?.minimum_balance(8 + Challenge::INIT_SPACE);
        let pool = (**info.lamports.borrow()).saturating_sub(floor);
        let amounts = split_pool(pool, &payout_bps)?;
        for (i, to) in ctx.remaining_accounts.iter().enumerate() {
            if amounts[i] == 0 {
                continue;
            }
            **info.try_borrow_mut_lamports()? = (**info.lamports.borrow()).checked_sub(amounts[i]).ok_or(ForkError::Math)?;
            **to.try_borrow_mut_lamports()? = (**to.lamports.borrow()).checked_add(amounts[i]).ok_or(ForkError::Math)?;
        }
        c.status = ChallengeStatus::Settled;
        c.snapshot_hash = snapshot_hash;
        emit!(Settled { challenge_id: c.challenge_id, snapshot_hash, pool, recipients: n as u8 });
        Ok(())
    }

    /// Liveness escape: the creator reclaims an unsettled pool once the grace period after the end has passed.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &mut ctx.accounts.challenge;
        require!(c.status == ChallengeStatus::Open, ForkError::NotOpen);
        let unlock = c.ends_at.checked_add(REFUND_GRACE_SECS).ok_or(ForkError::Math)?;
        require!(now >= unlock, ForkError::GraceNotElapsed);
        let info = c.to_account_info();
        let floor = Rent::get()?.minimum_balance(8 + Challenge::INIT_SPACE);
        let available = (**info.lamports.borrow()).saturating_sub(floor);
        let creator = ctx.accounts.creator.to_account_info();
        **info.try_borrow_mut_lamports()? = (**info.lamports.borrow()).checked_sub(available).ok_or(ForkError::Math)?;
        **creator.try_borrow_mut_lamports()? = (**creator.lamports.borrow()).checked_add(available).ok_or(ForkError::Math)?;
        c.status = ChallengeStatus::Refunded;
        Ok(())
    }
}

/// Split `pool` by bps; the rounding remainder goes to the first entry. Sum of the result == pool.
pub fn split_pool(pool: u64, bps: &[u16]) -> Result<Vec<u64>> {
    require!(!bps.is_empty(), ForkError::BadSplit);
    let mut amounts: Vec<u64> = Vec::with_capacity(bps.len());
    let mut sum = 0u64;
    for b in bps {
        let a = ((pool as u128) * (*b as u128) / (TOTAL_BPS as u128)) as u64;
        sum = sum.checked_add(a).ok_or(ForkError::Math)?;
        amounts.push(a);
    }
    amounts[0] = amounts[0].checked_add(pool.checked_sub(sum).ok_or(ForkError::Math)?).ok_or(ForkError::Math)?;
    Ok(amounts)
}

/// License math: fee = price * fee_bps / 10000 first, then the pool split by author bps (dust to the first author).
pub fn split_license(price: u64, fee_bps: u16, author_bps: &[u16]) -> Result<(u64, Vec<u64>)> {
    let fee = ((price as u128) * (fee_bps as u128) / (TOTAL_BPS as u128)) as u64;
    let pool = price.checked_sub(fee).ok_or(ForkError::Math)?;
    Ok((fee, split_pool(pool, author_bps)?))
}

fn pay<'info>(system: &AccountInfo<'info>, from: &AccountInfo<'info>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    system_program::transfer(CpiContext::new(system.clone(), Transfer { from: from.clone(), to: to.clone() }), amount)
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(graph_hash: [u8; 32])]
pub struct RegisterMechanic<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority @ ForkError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(init, payer = authority, space = 8 + Mechanic::INIT_SPACE, seeds = [b"mechanic", graph_hash.as_ref()], bump)]
    pub mechanic: Account<'info, Mechanic>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct License<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"mechanic", mechanic.graph_hash.as_ref()], bump = mechanic.bump)]
    pub mechanic: Account<'info, Mechanic>,
    // `init` makes a second license by the same buyer fail.
    #[account(init, payer = buyer, space = 8 + LicenseRecord::INIT_SPACE, seeds = [b"license", mechanic.key().as_ref(), buyer.key().as_ref()], bump)]
    pub license_record: Account<'info, LicenseRecord>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: must equal config.fee_wallet; only receives lamports.
    #[account(mut, address = config.fee_wallet @ ForkError::BadAccounts)]
    pub fee_wallet: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(challenge_id: u64)]
pub struct CreateChallenge<'info> {
    #[account(init, payer = creator, space = 8 + Challenge::INIT_SPACE, seeds = [b"challenge", challenge_id.to_le_bytes().as_ref()], bump)]
    pub challenge: Account<'info, Challenge>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority @ ForkError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"challenge", challenge.challenge_id.to_le_bytes().as_ref()], bump = challenge.bump)]
    pub challenge: Account<'info, Challenge>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut, seeds = [b"challenge", challenge.challenge_id.to_le_bytes().as_ref()], bump = challenge.bump, has_one = creator @ ForkError::Unauthorized)]
    pub challenge: Account<'info, Challenge>,
    #[account(mut)]
    pub creator: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub fee_wallet: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub struct AuthorShare {
    pub wallet: Pubkey,
    pub bps: u16,
}

#[account]
#[derive(InitSpace)]
pub struct Mechanic {
    pub graph_hash: [u8; 32],
    pub parent_hash: [u8; 32],
    pub price_lamports: u64,
    #[max_len(8)]
    pub authors: Vec<AuthorShare>,
    pub license_count: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LicenseRecord {
    pub buyer: Pubkey,
    pub paid: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum ChallengeKind {
    Episode,
    Game,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq, Debug)]
pub enum ChallengeStatus {
    Open,
    Settled,
    Refunded,
}

#[account]
#[derive(InitSpace)]
pub struct Challenge {
    pub challenge_id: u64,
    pub creator: Pubkey,
    pub kind: ChallengeKind,
    pub ends_at: i64,
    pub max_winners: u8,
    pub status: ChallengeStatus,
    pub snapshot_hash: [u8; 32],
    pub bump: u8,
}

#[event]
pub struct Licensed {
    pub graph_hash: [u8; 32],
    pub buyer: Pubkey,
    pub price: u64,
    pub fee: u64,
}

#[event]
pub struct Settled {
    pub challenge_id: u64,
    pub snapshot_hash: [u8; 32],
    pub pool: u64,
    pub recipients: u8,
}

#[error_code]
pub enum ForkError {
    #[msg("Fee is above 20 percent")]
    FeeTooHigh,
    #[msg("Authors must be 1 to 8 distinct wallets")]
    BadAuthors,
    #[msg("Author shares must be positive and sum to 10000 bps")]
    BadShares,
    #[msg("This mechanic is free to fork")]
    FreeMechanic,
    #[msg("Accounts do not match the registered recipients")]
    BadAccounts,
    #[msg("Arithmetic overflow")]
    Math,
    #[msg("Challenge is not open")]
    NotOpen,
    #[msg("Too early")]
    TooEarly,
    #[msg("Payout split must have 1 to max_winners entries summing to 10000 bps")]
    BadSplit,
    #[msg("A recipient appears twice")]
    DuplicateRecipient,
    #[msg("Only the authority may do this")]
    Unauthorized,
    #[msg("The refund grace period has not elapsed")]
    GraceNotElapsed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn program_conserves_lamports() {
        for price in [1u64, 7, 999, 100_000_000, 123_456_789_011] {
            for fee_bps in [0u16, 250, 500, 2000] {
                let (fee, amounts) = split_license(price, fee_bps, &[3334, 3333, 3333]).unwrap();
                assert_eq!(fee + amounts.iter().sum::<u64>(), price, "price {price} fee {fee_bps}");
            }
        }
    }

    #[test]
    fn program_dust_to_first_author() {
        let (fee, a) = split_license(100, 0, &[3334, 3333, 3333]).unwrap();
        assert_eq!(fee, 0);
        assert_eq!(a, vec![34, 33, 33]);
        let (_, b) = split_license(10, 0, &[5000, 5000]).unwrap();
        assert_eq!(b, vec![5, 5]);
    }

    #[test]
    fn program_fee_only_to_fee_wallet() {
        let (fee, a) = split_license(1_000_000, 500, &[10_000]).unwrap();
        assert_eq!(fee, 50_000);
        assert_eq!(a, vec![950_000]);
    }

    #[test]
    fn challenge_settles_by_bps() {
        let a = split_pool(200_000_000, &[3500, 2100, 1400, 1800, 900, 300]).unwrap();
        assert_eq!(a, vec![70_000_000, 42_000_000, 28_000_000, 36_000_000, 18_000_000, 6_000_000]);
    }

    #[test]
    fn challenge_conserves_lamports() {
        for pool in [1u64, 13, 1_000_000_001, 999_999_999_999] {
            let a = split_pool(pool, &[3502, 2100, 1400, 1000, 999, 999]).unwrap();
            assert_eq!(a.iter().sum::<u64>(), pool);
        }
    }

    #[test]
    fn space_constants() {
        assert_eq!(Config::INIT_SPACE, 32 + 32 + 2 + 1);
        assert_eq!(Mechanic::INIT_SPACE, 32 + 32 + 8 + 4 + 8 * (32 + 2) + 4 + 1);
        assert_eq!(Challenge::INIT_SPACE, 8 + 32 + 1 + 8 + 1 + 1 + 32 + 1);
    }
}
