# A simple report about in technical perspect to build an Meme index fund

### About the ability to buy a bulk of tokens in Atomic transaction?

- How we can buy a bulk of Solana token via Raydium?
  - Lets see in the custom-swap.ts example, its figure out how we can buy a bulk of tokens.
  - At this point, we just buy 10 tokens by using on address lookup tables.
  - You can check the success TX out there: https://explorer.solana.com/tx/2uNkznSfLk1XMUYwq5f29ycXBbKRVTN5CoVQy9dQupLmVYzXQRJx28aQhFFaVYe1QJPcbN8iAonfrD8V3rXvVWwE?cluster=devnet(I think can can buy more than 10 tokens but it's little hard to find token on Raydium pool)

### How it work
- We store account address in Lookup Table for each token so instead of using 32 bytes for addresses now it only use 1 byte for index in Lookup table account
- First for each token we want to swap, I will check lookup table account for this token. If it's not exits, then  create lookup table account for this token by using function ***createLookupTable*** and ***addAddressesToTable*** to address nessesary

### How to test
``` yarn cswap-v2```

### ToDo
- Save poolInfo to avoid call ```getPoolInfoFromRpc``  multiple times.
- Save AddressLookupTableAccount for each token to avoid call this function multiple times.
 ```js
    (await connection.getAddressLookupTable(swapInfo.lookupTableAddress)).value
  ``` 
