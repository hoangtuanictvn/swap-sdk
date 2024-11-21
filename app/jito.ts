import { JITO_RPC_URL } from "./constants"

const fetch = require("node-fetch") // Install with npm if running on Node.js
export async function getTipAccounts() {
	const headers = {
		"Content-Type": "application/json",
	}

	const body = JSON.stringify({
		jsonrpc: "2.0",
		id: 1,
		method: "getTipAccounts",
		params: [],
	})

	try {
		const res = await fetch(JITO_RPC_URL, {
			method: "POST",
			headers: headers,
			body: body,
		})
		const jsonResponse = await res.json()

		return jsonResponse.result // Access the "result" property
	} catch (error) {
		console.log({ error })
	}
}

export async function sendBundle(params: string[]) {
	const headers = {
		"Content-Type": "application/json",
	}

	const body = JSON.stringify({
		jsonrpc: "2.0",
		id: 1,
		method: "sendBundle",
		params: [params],
	})

	try {
		const res = await fetch(JITO_RPC_URL, {
			method: "POST",
			headers: headers,
			body: body,
		})
		const jsonResponse = await res.json()
		return jsonResponse.result
	} catch (error) {
		console.log({ error })
	}
}
