import {Raydium, TxVersion, parseTokenAccountResp} from '@raydium-io/raydium-sdk-v2'
import {Connection, Keypair, clusterApiUrl} from '@solana/web3.js'
import bs58 from 'bs58'

export const owner: Keypair = Keypair.fromSecretKey(bs58.decode('57zzdnamQCwNscgZfERGLLnpMDDmPkFNfcASzZfGMiZq8X2U1G5RSFW7jNiQKwwYZFqvFbv6LeGh8FWxG189qtAr'))
export const connection = new Connection(clusterApiUrl('devnet'))
export const txVersion = TxVersion.V0 // or TxVersion.LEGACY
const cluster = 'devnet'

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
        blockhashCommitment: 'finalized',
    })

    return raydium
}