import {
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityPoolKeys,
  DEVNET_PROGRAM_ID,
  MARKET_STATE_LAYOUT_V3,
  TOKEN_PROGRAM_ID,
  WSOL,
  Liquidity,
  Percent,
  Token,
  TokenAmount,
  LiquidityPoolInfo,
} from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createSyncNativeInstruction,
  NATIVE_MINT,
} from "@solana/spl-token";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { getPoolID } from "./fetch-pool-id";
import { initSdk } from "./init-sdk";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import { addAddressesToTable, createLookupTable } from "./lookupTable";
import { tokens } from "./token";

const keyPair = Keypair.fromSecretKey(
  bs58.decode(
    "57zzdnamQCwNscgZfERGLLnpMDDmPkFNfcASzZfGMiZq8X2U1G5RSFW7jNiQKwwYZFqvFbv6LeGh8FWxG189qtAr"
  )
);
const connection = new Connection(clusterApiUrl("devnet"));

const SWAP_AMOUNT_IN = 0.000001;
const SLIPPAGE = 2;

const getPoolKeys = async (ammId: string, connection: Connection) => {
  const ammAccount = await connection.getAccountInfo(new PublicKey(ammId));
  if (ammAccount) {
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data);
    const marketAccount = await connection.getAccountInfo(poolState.marketId);
    if (marketAccount) {
      const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
      const marketAuthority = PublicKey.createProgramAddressSync(
        [
          marketState.ownAddress.toBuffer(),
          marketState.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
        ],
        DEVNET_PROGRAM_ID.OPENBOOK_MARKET
      );
      return {
        id: new PublicKey(ammId),
        programId: DEVNET_PROGRAM_ID.AmmV4,
        status: poolState.status,
        baseDecimals: poolState.baseDecimal.toNumber(),
        quoteDecimals: poolState.quoteDecimal.toNumber(),
        lpDecimals: 9,
        baseMint: poolState.baseMint,
        quoteMint: poolState.quoteMint,
        version: 4,
        authority: new PublicKey(
          "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
        ),
        openOrders: poolState.openOrders,
        baseVault: poolState.baseVault,
        quoteVault: poolState.quoteVault,
        marketProgramId: DEVNET_PROGRAM_ID.OPENBOOK_MARKET,
        marketId: marketState.ownAddress,
        marketBids: marketState.bids,
        marketAsks: marketState.asks,
        marketEventQueue: marketState.eventQueue,
        marketBaseVault: marketState.baseVault,
        marketQuoteVault: marketState.quoteVault,
        marketAuthority: marketAuthority,
        targetOrders: poolState.targetOrders,
        lpMint: poolState.lpMint,
      } as unknown as LiquidityPoolKeys;
    }
  }
};

const calculateAmountOut = async (
  poolKeys: LiquidityPoolKeys,
  poolInfo: LiquidityPoolInfo,
  tokenToBuy: string,
  amountIn: number,
  rawSlippage: number
) => {
  let tokenOutMint = new PublicKey(tokenToBuy);
  let tokenOutDecimals = poolKeys.baseMint.equals(tokenOutMint)
    ? poolInfo.baseDecimals
    : poolKeys.quoteDecimals;
  let tokenInMint = poolKeys.baseMint.equals(tokenOutMint)
    ? poolKeys.quoteMint
    : poolKeys.baseMint;
  let tokenInDecimals = poolKeys.baseMint.equals(tokenOutMint)
    ? poolInfo.quoteDecimals
    : poolInfo.baseDecimals;
  const tokenIn = new Token(TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals);
  const tknAmountIn = new TokenAmount(tokenIn, amountIn, false);
  const tokenOut = new Token(TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals);
  const slippage = new Percent(rawSlippage, 100);
  return {
    amountIn: tknAmountIn,
    tokenIn: tokenInMint,
    tokenOut: tokenOutMint,
    ...Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn: tknAmountIn,
      currencyOut: tokenOut,
      slippage,
    }),
  };
};

const makeSwapInstruction = async (
  connection: Connection,
  tokenToBuy: string,
  rawAmountIn: number,
  slippage: number,
  poolKeys: LiquidityPoolKeys,
  poolInfo: LiquidityPoolInfo,
  keyPair: Keypair
) => {
  const { amountIn, tokenIn, tokenOut, minAmountOut } =
    await calculateAmountOut(
      poolKeys,
      poolInfo,
      tokenToBuy,
      rawAmountIn,
      slippage
    );
  let tokenInAccount: PublicKey;
  let tokenOutAccount: PublicKey;

  if (tokenIn.toString() == WSOL.mint) {
    tokenInAccount = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        keyPair,
        NATIVE_MINT,
        keyPair.publicKey
      )
    ).address;
    tokenOutAccount = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        keyPair,
        tokenOut,
        keyPair.publicKey
      )
    ).address;
  } else {
    tokenOutAccount = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        keyPair,
        NATIVE_MINT,
        keyPair.publicKey
      )
    ).address;
    tokenInAccount = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        keyPair,
        tokenIn,
        keyPair.publicKey
      )
    ).address;
  }

  const ix = new TransactionInstruction({
    programId: new PublicKey(poolKeys.programId),
    keys: [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: poolKeys.id, isSigner: false, isWritable: true },
      { pubkey: poolKeys.authority, isSigner: false, isWritable: false },
      { pubkey: poolKeys.openOrders, isSigner: false, isWritable: true },
      { pubkey: poolKeys.baseVault, isSigner: false, isWritable: true },
      { pubkey: poolKeys.quoteVault, isSigner: false, isWritable: true },
      { pubkey: poolKeys.marketProgramId, isSigner: false, isWritable: false },
      { pubkey: poolKeys.marketId, isSigner: false, isWritable: true },
      { pubkey: poolKeys.marketBids, isSigner: false, isWritable: true },
      { pubkey: poolKeys.marketAsks, isSigner: false, isWritable: true },
      { pubkey: poolKeys.marketEventQueue, isSigner: false, isWritable: true },
      { pubkey: poolKeys.marketBaseVault, isSigner: false, isWritable: true },
      { pubkey: poolKeys.marketQuoteVault, isSigner: false, isWritable: true },
      { pubkey: poolKeys.marketAuthority, isSigner: false, isWritable: false },
      { pubkey: tokenInAccount, isSigner: false, isWritable: true },
      { pubkey: tokenOutAccount, isSigner: false, isWritable: true },
      { pubkey: keyPair.publicKey, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(
      Uint8Array.of(
        9,
        ...new BN(amountIn.raw).toArray("le", 8),
        ...new BN(minAmountOut.raw).toArray("le", 8)
      )
    ),
  });

  const accountKeys = [
    TOKEN_PROGRAM_ID,
    poolKeys.id,
    poolKeys.authority,
    poolKeys.openOrders,
    poolKeys.baseVault,
    poolKeys.quoteVault,
    poolKeys.marketProgramId,
    poolKeys.marketId,
    poolKeys.marketBids,
    poolKeys.marketAsks,
    poolKeys.marketEventQueue,
    poolKeys.marketBaseVault,
    poolKeys.marketQuoteVault,
    poolKeys.marketAuthority,
    tokenInAccount,
    tokenOutAccount,
    keyPair.publicKey,
  ];

  return {
    swapIX: ix,
    tokenInAccount: tokenInAccount,
    tokenOutAccount: tokenOutAccount,
    tokenIn,
    tokenOut,
    amountIn,
    minAmountOut,
    accountKeys,
  };
};

export interface TokenInfo {
  name: string;
  mint: string;
  lut?: PublicKey;
}

const executeTransaction = async () => {
  const raydium = await initSdk();
  const transaction = new Transaction();
  const lookupTables = [];

  for (const token of tokens) {
    const swapInfo = await createSwapInstruction(
      raydium,
      token,
      SWAP_AMOUNT_IN,
      SLIPPAGE
    );
    transaction.instructions.push(...swapInfo.instructions);

    const lut = (
      await connection.getAddressLookupTable(swapInfo.lookupTableAddress)
    ).value;
    lookupTables.push(lut);
    console.log(`${token.name} Lookup Table:`, lut);
  }
  await finalizeTransaction(transaction, lookupTables);
};

export async function createLUTForToken(
  name: string,
  accountKeys: PublicKey[]
) {
  const lookupTableAddress = await createLookupTable();
  await addAddressesToTable(lookupTableAddress, accountKeys);

  console.log(`LookupTableAddress of token ${name} is : ${lookupTableAddress}`);
  return lookupTableAddress;
}

async function createSwapInstruction(
  raydium: Raydium,
  tokenInfo: TokenInfo,
  swapAmountIn: number,
  slippage: number
) {
  const ammId = await getPoolID(tokenInfo.mint);
  const poolKeys = await getPoolKeys(ammId, connection);

  if (poolKeys) {
    const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId: ammId });
    poolKeys.authority = new PublicKey(data.poolKeys.authority);
    const instructions: TransactionInstruction[] = [];
    const { swapIX, tokenInAccount, amountIn, accountKeys } =
      await makeSwapInstruction(
        connection,
        tokenInfo.mint,
        swapAmountIn,
        slippage,
        poolKeys,
        {
          status: new BN(data.poolInfo.status),
          baseDecimals: data.poolInfo.mintA.decimals,
          quoteDecimals: data.poolInfo.mintB.decimals,
          lpDecimals: data.poolInfo.lpMint.decimals,
          baseReserve: data.poolInfo.baseReserve,
          quoteReserve: data.poolInfo.quoteReserve,
          lpSupply: new BN(data.poolInfo.lpAmount),
          startTime: new BN(new Date().getTime()),
        },
        keyPair
      );
    instructions.push(swapIX);
    if (tokenInAccount.toString() === WSOL.mint) {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: keyPair.publicKey,
          toPubkey: tokenInAccount,
          lamports: amountIn.raw.toNumber() * 100,
        }),
        createSyncNativeInstruction(tokenInAccount, TOKEN_PROGRAM_ID)
      );
    }

    if (!tokenInfo.lut) {
      const lookupTableAddress = await createLookupTable();
      await addAddressesToTable(lookupTableAddress, accountKeys);
      console.log(
        `Lookup Table created for ${tokenInfo.name} at: ${lookupTableAddress}`
      );
      return { instructions, accountKeys, lookupTableAddress };
    } else {
      return { instructions, accountKeys, lookupTableAddress: tokenInfo.lut };
    }
  }
}
const finalizeTransaction = async (transaction, lookupTables) => {
  let latestBlockhash = await connection.getLatestBlockhash("finalized");
  const messageV0 = new TransactionMessage({
    payerKey: keyPair.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: transaction.instructions,
  }).compileToV0Message(lookupTables);

  const transactionV0 = new VersionedTransaction(messageV0);
  transactionV0.sign([keyPair]);

  const txid = await connection.sendTransaction(transactionV0, {
    maxRetries: 5,
  });
  const confirmation = await connection.confirmTransaction({
    signature: txid,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  if (confirmation.value.err) {
    throw new Error("❌ - Transaction not confirmed.");
  } else {
    console.log(
      "🎉 Transaction Successfully Confirmed!",
      `\nhttps://explorer.solana.com/tx/${txid}?cluster=devnet`
    );
  }
};

// Convert 0.01 SOL to USDC
executeTransaction();
