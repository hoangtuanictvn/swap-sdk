import {
	LIQUIDITY_STATE_LAYOUT_V4,
	LiquidityPoolKeys,
	MAINNET_PROGRAM_ID,
	MARKET_STATE_LAYOUT_V3,
	TOKEN_PROGRAM_ID,
	WSOL,
	Liquidity,
	Percent,
	Token,
	TokenAmount,
	LiquidityPoolInfo,
} from "@raydium-io/raydium-sdk"
import BN from "bn.js"
import {
	Connection,
	PublicKey,
	Keypair,
	SystemProgram,
	Transaction,
	TransactionInstruction,
	sendAndConfirmTransaction,
	clusterApiUrl,
	TransactionMessage,
} from "@solana/web3.js"
import {
	createWrappedNativeAccount,
	getOrCreateAssociatedTokenAccount,
	createSyncNativeInstruction,
	NATIVE_MINT,
} from "@solana/spl-token"
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes"
import { getPoolID } from "./fetch-pool-id"
import { initSdk } from "./init-sdk"
import BN__default from "bn.js"
import { web3 } from "@coral-xyz/anchor"
import { MAINNET_RPC_URL, SINGER_PRIVATE_KEY } from "./constants"

const getPoolKeys = async (ammId: string, connection: Connection) => {
	const ammAccount = await connection.getAccountInfo(new PublicKey(ammId))
	if (ammAccount) {
		const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(ammAccount.data)
		const marketAccount = await connection.getAccountInfo(
			poolState.marketId
		)
		if (marketAccount) {
			const marketState = MARKET_STATE_LAYOUT_V3.decode(
				marketAccount.data
			)
			const marketAuthority = PublicKey.createProgramAddressSync(
				[
					marketState.ownAddress.toBuffer(),
					marketState.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
				],
				MAINNET_PROGRAM_ID.OPENBOOK_MARKET
			)
			return {
				id: new PublicKey(ammId),
				programId: MAINNET_PROGRAM_ID.AmmV4,
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
				marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
				marketId: marketState.ownAddress,
				marketBids: marketState.bids,
				marketAsks: marketState.asks,
				marketEventQueue: marketState.eventQueue,
				marketBaseVault: marketState.baseVault,
				marketQuoteVault: marketState.quoteVault,
				marketAuthority: marketAuthority,
				targetOrders: poolState.targetOrders,
				lpMint: poolState.lpMint,
			} as unknown as LiquidityPoolKeys
		}
	}
}

const calculateAmountOut = async (
	poolKeys: LiquidityPoolKeys,
	poolInfo: LiquidityPoolInfo,
	tokenToBuy: string,
	amountIn: number,
	rawSlippage: number
) => {
	let tokenOutMint = new PublicKey(tokenToBuy)
	let tokenOutDecimals = poolKeys.baseMint.equals(tokenOutMint)
		? poolInfo.baseDecimals
		: poolKeys.quoteDecimals
	let tokenInMint = poolKeys.baseMint.equals(tokenOutMint)
		? poolKeys.quoteMint
		: poolKeys.baseMint
	let tokenInDecimals = poolKeys.baseMint.equals(tokenOutMint)
		? poolInfo.quoteDecimals
		: poolInfo.baseDecimals
	const tokenIn = new Token(TOKEN_PROGRAM_ID, tokenInMint, tokenInDecimals)
	const tknAmountIn = new TokenAmount(tokenIn, amountIn, false)
	const tokenOut = new Token(TOKEN_PROGRAM_ID, tokenOutMint, tokenOutDecimals)
	const slippage = new Percent(rawSlippage, 100)
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
	}
}

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
		)
	let tokenInAccount: PublicKey
	let tokenOutAccount: PublicKey

	if (tokenIn.toString() == WSOL.mint) {
		tokenInAccount = (
			await getOrCreateAssociatedTokenAccount(
				connection,
				keyPair,
				NATIVE_MINT,
				keyPair.publicKey
			)
		).address
		tokenOutAccount = (
			await getOrCreateAssociatedTokenAccount(
				connection,
				keyPair,
				tokenOut,
				keyPair.publicKey
			)
		).address
	} else {
		tokenOutAccount = (
			await getOrCreateAssociatedTokenAccount(
				connection,
				keyPair,
				NATIVE_MINT,
				keyPair.publicKey
			)
		).address
		tokenInAccount = (
			await getOrCreateAssociatedTokenAccount(
				connection,
				keyPair,
				tokenIn,
				keyPair.publicKey
			)
		).address
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
			{
				pubkey: poolKeys.marketProgramId,
				isSigner: false,
				isWritable: false,
			},
			{ pubkey: poolKeys.marketId, isSigner: false, isWritable: true },
			{ pubkey: poolKeys.marketBids, isSigner: false, isWritable: true },
			{ pubkey: poolKeys.marketAsks, isSigner: false, isWritable: true },
			{
				pubkey: poolKeys.marketEventQueue,
				isSigner: false,
				isWritable: true,
			},
			{
				pubkey: poolKeys.marketBaseVault,
				isSigner: false,
				isWritable: true,
			},
			{
				pubkey: poolKeys.marketQuoteVault,
				isSigner: false,
				isWritable: true,
			},
			{
				pubkey: poolKeys.marketAuthority,
				isSigner: false,
				isWritable: false,
			},
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
	})
	return {
		swapIX: ix,
		tokenInAccount: tokenInAccount,
		tokenOutAccount: tokenOutAccount,
		tokenIn,
		tokenOut,
		amountIn,
		minAmountOut,
	}
}

const USDC_ADDRESS = "5QiDKfdEHAqAMEDMEs48izW8WFKdGnMA3BmoHrQgyhcw"
const USDC_ADDRESS_2 = "797Qfih1SAsmPrFnpkxByNUanAEeoPPWJVUJeMeJ55zk"

const executeTransaction = async (swapAmountIn: number, tokenToBuy: string) => {
	const connection = new Connection(MAINNET_RPC_URL)
	const raydium = await initSdk()
	const keyPair = Keypair.fromSecretKey(bs58.decode(SINGER_PRIVATE_KEY))
	const ammId = await getPoolID(USDC_ADDRESS)
	const ammId2 = await getPoolID(USDC_ADDRESS_2)
	const slippage = 100000 // 2% slippage tolerance

	const poolKeys = await getPoolKeys(ammId, connection)
	const poolKeys2 = await getPoolKeys(ammId2, connection)
	console.log({ poolKeys })

	if (poolKeys && poolKeys2) {
		const data = await raydium.liquidity.getPoolInfoFromRpc({
			poolId: ammId,
		})
		poolKeys.authority = new PublicKey(data.poolKeys.authority)
		poolKeys2.authority = new PublicKey(data.poolKeys.authority)

		const txn = new Transaction()
		const { swapIX, tokenInAccount, tokenIn, amountIn } =
			await makeSwapInstruction(
				connection,
				tokenToBuy,
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
			)
		if (tokenIn.toString() == WSOL.mint) {
			// Convert SOL to Wrapped SOL
			txn.add(
				SystemProgram.transfer({
					fromPubkey: keyPair.publicKey,
					toPubkey: tokenInAccount,
					lamports: amountIn.raw.toNumber() * 100,
				}),
				createSyncNativeInstruction(tokenInAccount, TOKEN_PROGRAM_ID)
			)
		}
		console.log("1111111")
		const data2 = await makeSwapInstruction(
			connection,
			USDC_ADDRESS_2,
			swapAmountIn,
			slippage,
			poolKeys2,
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
		)
		console.log("222222")

		txn.instructions.push(swapIX)
		txn.instructions.push(data2.swapIX)
		txn.instructions.push(swapIX)
		// txn.instructions.push(data2.swapIX)
		// txn.instructions.push(swapIX)
		// txn.instructions.push(swapIX)
		// txn.instructions.push(swapIX)
		// txn.instructions.push(swapIX)
		// txn.instructions.push(swapIX)
		// txn.instructions.push(swapIX)
		// txn.instructions.push(swapIX)
		// txn.instructions.push(swapIX)
		// txn.instructions.push(swapIX)
		console.log("start swap token")
		// console.log(JSON.stringify(txn))

		const lookupTableAccount = (
			await connection.getAddressLookupTable(
				new web3.PublicKey(
					"5pGSbeRqek64mHr1RgUj2Qdn3hbSYtV3W6grK86QFwCx"
				)
			)
		).value
		let latestBlockhash = await connection.getLatestBlockhash("finalized")

		const messageV0 = new TransactionMessage({
			payerKey: keyPair.publicKey,
			instructions: txn.instructions,
			recentBlockhash: latestBlockhash.blockhash,
		}).compileToV0Message([lookupTableAccount])

		console.log(latestBlockhash.blockhash)
		const transactionV0 = new web3.VersionedTransaction(messageV0)

		transactionV0.sign([keyPair])

		console.log("signing!")
		// Step 4 - Send our v0 transaction to the cluster
		const txid = await connection.sendTransaction(transactionV0, {
			maxRetries: 5,
		})
		console.log("   ✅ - Transaction sent to network")

		// Step 5 - Confirm Transaction
		const confirmation = await connection.confirmTransaction({
			signature: txid,
			blockhash: latestBlockhash.blockhash,
			lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
		})
		if (confirmation.value.err) {
			throw new Error("   ❌ - Transaction not confirmed.")
		}
		console.log(
			"🎉 Transaction Successfully Confirmed!",
			"\n",
			`https://explorer.solana.com/tx/${txid}?cluster=devnet`
		)

		// const txid = await web3.sendAndConfirmTransaction(connection, transactionV0);

		// const hash = await sendAndConfirmTransaction(
		// 	connection,
		// 	transactionV0,
		// 	[keyPair],
		// 	{
		// 		skipPreflight: true,
		// 		preflightCommitment: "confirmed",
		// 	}
		// )
		// console.log("Transaction Completed Successfully 🎉🚀.")
		// console.log(`Explorer URL: https://solscan.io/tx/${hash}`)
	} else {
		console.log(`Could not get PoolKeys for AMM: ${ammId}`)
	}
}

// // Convert 0.01 SOL to USDC
try {
	executeTransaction(
		0.000001,
		USDC_ADDRESS // USDC Address
	)
} catch (error) {
	console.error("Error executing transaction:", error)
}
