import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js"
import { LIQUIDITY_STATE_LAYOUT_V4 } from "@raydium-io/raydium-sdk"
import { MAINNET_RPC_URL } from "./constants"

const RAYDIUM_LIQUIDITY_POOL_ADDRESS =
	"675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
const WSOL_ADDRESS = "So11111111111111111111111111111111111111112"

export async function getPoolID(
	baseTokenAddress: string
): Promise<string | null> {
	let base = new PublicKey(baseTokenAddress)
	const quote = new PublicKey(WSOL_ADDRESS)
	const commitment = "confirmed"

	try {
		const connection = new Connection(MAINNET_RPC_URL)

		// First try with base
		const baseAccounts = await connection.getProgramAccounts(
			new PublicKey(RAYDIUM_LIQUIDITY_POOL_ADDRESS),
			{
				commitment,
				filters: [
					{ dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
					{
						memcmp: {
							offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf(
								"baseMint"
							),
							bytes: base.toBase58(),
						},
					},
					{
						memcmp: {
							offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf(
								"quoteMint"
							),
							bytes: quote.toBase58(),
						},
					},
				],
			}
		)

		if (baseAccounts.length > 0) {
			const { pubkey } = baseAccounts[0]
			return pubkey.toString()
		}

		// If base fails, try with quote
		const quoteAccounts = await connection.getProgramAccounts(
			new PublicKey(RAYDIUM_LIQUIDITY_POOL_ADDRESS),
			{
				commitment,
				filters: [
					{ dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
					{
						memcmp: {
							offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf(
								"baseMint"
							),
							bytes: quote.toBase58(),
						},
					},
					{
						memcmp: {
							offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf(
								"quoteMint"
							),
							bytes: base.toBase58(),
						},
					},
				],
			}
		)

		if (quoteAccounts.length > 0) {
			const { pubkey } = quoteAccounts[0]
			return pubkey.toString()
		}

		return null
	} catch (error) {
		console.error("Error fetching Market accounts:", error)
		return null
	}
}
