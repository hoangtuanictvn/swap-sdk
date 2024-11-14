# A simple report about in technical perspect to build an Meme index fund

### About the ability to buy a bulk of tokens in Atomic transaction?

- How we can buy a bulk of Solana token via Raydium?
  - Lets see in the custom-swap.ts example, its figure out how we can buy a bulk of tokens.
  - At this point, we just buy 11 tokens by using on address lookup tables.
  - You can check the success TX out there: https://explorer.solana.com/tx/N1xKferoQzDQSfnpd7cmNwWekBXWVWbjo8f6qNFFpMtFGyNb3MzyFTJrrL5uuGo9iMy7dtm1mVD3XQFk4MDJv2t?cluster=devnet
  - Failed when buy 12 tokens.

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
