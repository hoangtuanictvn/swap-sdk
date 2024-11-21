import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes"
import {
	clusterApiUrl,
	AddressLookupTableProgram,
	Connection,
	Keypair,
	LAMPORTS_PER_SOL,
	PublicKey,
	SystemProgram,
	TransactionInstruction,
	TransactionMessage,
	VersionedTransaction,
	ComputeBudgetProgram,
} from "@solana/web3.js"
import { connection } from "./init-sdk"
import { MAINNET_RPC_URL, SINGER_PRIVATE_KEY } from "./constants"

const SIGNER_WALLET = Keypair.fromSecretKey(bs58.decode(SINGER_PRIVATE_KEY))

const SOLANA_CONNECTION = new Connection(MAINNET_RPC_URL)

export async function createAndSendV0Tx(
	txInstructions: TransactionInstruction[]
) {
	let latestBlockhash = await SOLANA_CONNECTION.getLatestBlockhash(
		"finalized"
	)

	txInstructions.push(
		ComputeBudgetProgram.setComputeUnitPrice({
			microLamports: 500000,
		})
	)

	const messageV0 = new TransactionMessage({
		payerKey: SIGNER_WALLET.publicKey,
		recentBlockhash: latestBlockhash.blockhash,
		instructions: txInstructions,
	}).compileToV0Message([])
	const transaction = new VersionedTransaction(messageV0)

	transaction.sign([SIGNER_WALLET])
	const txid = await SOLANA_CONNECTION.sendTransaction(transaction, {
		maxRetries: 5,
	})
	const confirmation = await SOLANA_CONNECTION.confirmTransaction({
		signature: txid,
		blockhash: latestBlockhash.blockhash,
		lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
	})
	if (confirmation.value.err) {
		throw new Error("❌ - Transaction not confirmed.")
	}
}

export async function createLookupTable() {
	const [lookupTableInst, lookupTableAddress] =
		AddressLookupTableProgram.createLookupTable({
			authority: SIGNER_WALLET.publicKey,
			payer: SIGNER_WALLET.publicKey,
			recentSlot: (await SOLANA_CONNECTION.getSlot()) - 1,
		})
	await createAndSendV0Tx([lookupTableInst])
	console.log({ lookupTableAddress })
	return lookupTableAddress
}

export async function addAddressesToTable(
	lookupTableAddress: PublicKey,
	addresses: PublicKey[]
) {
	const lookupTableAccount = (
		await connection.getAddressLookupTable(lookupTableAddress)
	).value

	// console.log(lookupTableAccount.state.addresses)
	// console.log({ addresses })
	const addressesToAdd = addresses
		.map((publicKey) => {
			return publicKey.toBase58()
		})
		.filter((address) => {
			return !lookupTableAccount.state.addresses
				.map((publicKey) => publicKey.toBase58())
				.includes(address)
		})
		.map((address) => new PublicKey(address))

	// filter((address) => {

	//   const found = lookupTableAccount.state.addresses.find((lookupTableAccount)=>{
	//     lookupTableAccount.toBase58() === address.toBase58()
	//   })

	// 	// return !lookupTableAccount.state.addresses.includes(address)
	// })
	console.log({ addressesToAdd })
	if (addressesToAdd.length === 0) {
		console.log("No addresses to add")
		return
	}

	const addAddressesInstruction = AddressLookupTableProgram.extendLookupTable(
		{
			payer: SIGNER_WALLET.publicKey,
			authority: SIGNER_WALLET.publicKey,
			lookupTable: lookupTableAddress,
			addresses: addressesToAdd,
		}
	)
	await createAndSendV0Tx([addAddressesInstruction])
	console.log(
		`Lookup Table URL: `,
		`https://explorer.solana.com/address/${lookupTableAddress.toString()}`
	)
}

export async function findAddressesInTable(lookupTableAddress: PublicKey) {
	const lookupTableAccount = await SOLANA_CONNECTION.getAddressLookupTable(
		lookupTableAddress
	)
	console.log(
		`Successfully found lookup table: `,
		lookupTableAccount.value?.key.toString()
	)

	if (!lookupTableAccount.value) return

	for (let i = 0; i < lookupTableAccount.value.state.addresses.length; i++) {
		const address = lookupTableAccount.value.state.addresses[i]
		console.log(`   Address ${i + 1}: ${address.toBase58()}`)
	}
}

export async function compareTxSize(lookupTableAddress: PublicKey) {
	const lookupTable = (
		await SOLANA_CONNECTION.getAddressLookupTable(lookupTableAddress)
	).value
	if (!lookupTable) return
	console.log("   ✅ - Fetched Lookup Table:", lookupTable.key.toString())

	const txInstructions: TransactionInstruction[] = []
	for (let i = 0; i < lookupTable.state.addresses.length; i++) {
		const address = lookupTable.state.addresses[i]
		txInstructions.push(
			SystemProgram.transfer({
				fromPubkey: SIGNER_WALLET.publicKey,
				toPubkey: address,
				lamports: 0.01 * LAMPORTS_PER_SOL,
			})
		)
	}

	let latestBlockhash = await SOLANA_CONNECTION.getLatestBlockhash(
		"finalized"
	)

	const messageWithLookupTable = new TransactionMessage({
		payerKey: SIGNER_WALLET.publicKey,
		recentBlockhash: latestBlockhash.blockhash,
		instructions: txInstructions,
	}).compileToV0Message([lookupTable])

	const transactionWithLookupTable = new VersionedTransaction(
		messageWithLookupTable
	)
	transactionWithLookupTable.sign([SIGNER_WALLET])

	const messageWithoutLookupTable = new TransactionMessage({
		payerKey: SIGNER_WALLET.publicKey,
		recentBlockhash: latestBlockhash.blockhash,
		instructions: txInstructions,
	}).compileToV0Message()
	const transactionWithoutLookupTable = new VersionedTransaction(
		messageWithoutLookupTable
	)
	transactionWithoutLookupTable.sign([SIGNER_WALLET])
	console.log("   ✅ - Compiled Transactions")
}

async function main() {
	const lookupTableAddress = await createLookupTable()
	const addresses = [Keypair.generate().publicKey, SystemProgram.programId]
	await addAddressesToTable(lookupTableAddress, addresses)

	await findAddressesInTable(lookupTableAddress)

	await compareTxSize(lookupTableAddress)
}

export async function createAndExtendLookupTable(addresses: PublicKey[]) {
	const lookupTableAddress = await createLookupTable()
	await addAddressesToTable(lookupTableAddress, addresses)
	return lookupTableAddress
}

// main()
//createLookupTable();
//addAddressesToTable();
//findAddressesInTable();
//compareTxSize();
