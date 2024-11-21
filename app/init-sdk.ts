import {
	Raydium,
	TxVersion,
	parseTokenAccountResp,
} from "@raydium-io/raydium-sdk-v2"
import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js"
import bs58 from "bs58"
import { MAINNET_RPC_URL, SINGER_PRIVATE_KEY } from "./constants"

export const owner: Keypair = Keypair.fromSecretKey(
	bs58.decode(SINGER_PRIVATE_KEY)
)
export const connection = new Connection(MAINNET_RPC_URL)
export const txVersion = TxVersion.V0 // or TxVersion.LEGACY
const cluster = "mainnet"

let raydium: Raydium | undefined
export const initSdk = async (params?: { loadToken?: boolean }) => {
	console.log(owner.publicKey.toBase58())
	if (raydium) return raydium
	raydium = await Raydium.load({
		owner,
		connection,
		cluster,
		disableFeatureCheck: true,
		disableLoadToken: !params?.loadToken,
		blockhashCommitment: "finalized",
	})

	return raydium
}
