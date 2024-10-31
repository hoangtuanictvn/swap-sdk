import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    VersionedTransaction,
    TransactionMessage,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {bs58} from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import {
    AmmRpcData,
    AmmV4Keys,
    ApiV3PoolInfoStandardItem,
    makeAMMSwapInstruction, makeSwapFixedInInstruction,
    TxVersion
} from "@raydium-io/raydium-sdk-v2";
import {Account, getOrCreateAssociatedTokenAccount, NATIVE_MINT} from "@solana/spl-token";
import {initSdk, txVersion} from "./init-sdk";
import Decimal from "decimal.js";
import BN from "bn.js";
import {getPoolID} from "./fetch-pool-id";
import {AmmV5Keys} from "@raydium-io/raydium-sdk-v2/src/api/type";
import {BigNumberish} from "@raydium-io/raydium-sdk-v2/src/common/bignumber";
import {SwapSide} from "@raydium-io/raydium-sdk-v2/src/raydium/liquidity/type";
import {swapInstruction} from "@raydium-io/raydium-sdk";
import {version} from "chai";

const DEVNET_URL = "https://api.devnet.solana.com";
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112"); // Devnet SOL Mint
const USDC_MINT = new PublicKey("BXXkv6kCVkLnaXx7UoSCy4X5pGDmSAE37pcX2f1Aqffg"); // Example USDC Mint on Devnet

// Create a new connection to Solana Devnet
const connection = new Connection(DEVNET_URL, "confirmed");

// Replace this with your wallet's Keypair
const payer = Keypair.fromSecretKey(bs58.decode('57zzdnamQCwNscgZfERGLLnpMDDmPkFNfcASzZfGMiZq8X2U1G5RSFW7jNiQKwwYZFqvFbv6LeGh8FWxG189qtAr'));

// Swap SOL to USDC using Raydium's AMM
async function swapSolToUsdc() {
    console.log(`Payer: ${payer.publicKey.toBase58()}`)
    const raydium = await initSdk()
    const amountIn = 500
    const inputMint = NATIVE_MINT.toBase58()
    const poolId = '9c5AukywDrjLyL9CosWRzSHFKY1Hcu8cdnPVtyhh3mVN' // SOL-USDC pool

    let poolInfo: ApiV3PoolInfoStandardItem | undefined
    let poolKeys: AmmV4Keys | undefined
    let rpcData: AmmRpcData

    let pid = await getPoolID("5QiDKfdEHAqAMEDMEs48izW8WFKdGnMA3BmoHrQgyhcw")

    const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId: pid })

    poolInfo = data.poolInfo
    poolKeys = data.poolKeys
    rpcData = data.poolRpcData
    const [baseReserve, quoteReserve, status] = [rpcData.baseReserve, rpcData.quoteReserve, rpcData.status.toNumber()]

    if (poolInfo.mintA.address !== inputMint && poolInfo.mintB.address !== inputMint)
        throw new Error('input mint does not match pool')

    const baseIn = inputMint === poolInfo.mintA.address
    const [mintIn, mintOut] = baseIn ? [poolInfo.mintA, poolInfo.mintB] : [poolInfo.mintB, poolInfo.mintA]

    const out = raydium.liquidity.computeAmountOut({
        poolInfo: {
            ...poolInfo,
            baseReserve,
            quoteReserve,
            status,
            version: 4,
        },
        amountIn: new BN(amountIn),
        mintIn: mintIn.address,
        mintOut: mintOut.address,
        slippage: 0.01, // range: 1 ~ 0.0001, means 100% ~ 0.01%
    })

    console.log(
        `computed swap ${new Decimal(amountIn)
            .div(10 ** mintIn.decimals)
            .toDecimalPlaces(mintIn.decimals)
            .toString()} ${mintIn.symbol || mintIn.address} to ${new Decimal(out.amountOut.toString())
            .div(10 ** mintOut.decimals)
            .toDecimalPlaces(mintOut.decimals)
            .toString()} ${mintOut.symbol || mintOut.address}, minimum amount out ${new Decimal(out.minAmountOut.toString())
            .div(10 ** mintOut.decimals)
            .toDecimalPlaces(mintOut.decimals)} ${mintOut.symbol || mintOut.address}`
    )

    let tAta: Account = null
    let sAta: Account = null
    try {
        tAta = await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey("5QiDKfdEHAqAMEDMEs48izW8WFKdGnMA3BmoHrQgyhcw"), payer.publicKey)
        sAta = await getOrCreateAssociatedTokenAccount(connection, payer, new PublicKey("So11111111111111111111111111111111111111112"), payer.publicKey)
    }catch (e) {
        console.log(e)
    }


    // let x = await raydium.tradeV2.wrapWSol(2*LAMPORTS_PER_SOL)
    // const signature = await sendAndConfirmTransaction(connection, x.builder.build().transaction, [payer], {
    //     skipPreflight: true,
    // });
    // console.log('wrap SOL successful with signature:', signature);

    let transaction = new Transaction();

    console.log(poolKeys)

    const { builder } = await raydium.liquidity.swap({
        poolInfo,
        poolKeys,
        amountIn: new BN(amountIn),
        amountOut: out.minAmountOut, // out.amountOut means amount 'without' slippage
        fixedSide: 'in',
        inputMint: mintIn.address,
        txVersion,

        // optional: set up token account
        // config: {
        //   inputUseSolBalance: true, // default: true, if you want to use existed wsol token account to pay token in, pass false
        //   outputUseSolBalance: true, // default: true, if you want to use existed wsol token account to receive token out, pass false
        //   associatedOnly: true, // default: true, if you want to use ata only, pass true
        // },

        // optional: set up priority fee here
        computeBudgetConfig: {
            units: 60000,
            microLamports: 100000000,
        },
    })

    // const ix = makeSwapFixedInInstruction(
    // {
    //     poolKeys: poolKeys,
    //     userKeys: {
    //         tokenAccountIn: sAta.address,
    //         tokenAccountOut: tAta.address,
    //         owner: payer.publicKey,
    //     },
    //     amountIn: 1,
    //     minAmountOut: 1,
    // },        4)
    //
    // transaction.instructions.push(ix)

    const sig = await sendAndConfirmTransaction(connection, builder.build().transaction, [payer], {
        skipPreflight: true,
    });
    console.log('Transaction 2 successful with signature:', sig);

    // const { txId } = await execute({ sendAndConfirm: true })
    // console.log(`swap successfully in amm pool:`, { txId: `https://explorer.solana.com/tx/${txId}` })

    process.exit()
}

// Execute the swap
swapSolToUsdc();
  