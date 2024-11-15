# The report for the solution to buy tokens in bulk of 20-30 tokens in Atomic transaction?
## Key metrics:
 - The maximum numbers of token we can buy at this time: 11 tokens
 - The maximum accounts used: 121 accounts
 - The maximum comupute was used: 1200 CPU

### How we can archived?
- We store account address in Lookup Table for each token so instead of using 32 bytes for addresses now it only use 1 byte for index in Lookup table account, here is the step:

- 1st: For each token, we will check if the LUT exist or not. If it's not exits, then create lookup table account for this token by using function ***createLookupTable*** and ***addAddressesToTable*** to add nessesary address for a swap instruction.
- 2st: Using Tx V0 to send and confirm tx

### Why it can be archived?

- Base on this docs: https://solana.com/docs/advanced/lookup-tables#compressing-onchain-addresses

  - We can enables storing up to 256 addresses in a single lookup table for use inside any given transaction.
  - For each swap tx, we need 17 input address, to totally we can swap 256/17 = ~15 meme tokens at once

- But why we can't buy 15 meme tokens because limitation of the serialized tx size https://solscan.io/tx/inspector?txhash=N1xKferoQzDQSfnpd7cmNwWekBXWVWbjo8f6qNFFpMtFGyNb3MzyFTJrrL5uuGo9iMy7dtm1mVD3XQFk4MDJv2t&cluster=devnet


### How to test?
``` yarn cswap-v2```

### ToDo
- calculate the compute to forward swapped result to the vault
- move swap logic to CPI call in internal of the Program
- Find an other way to optimize the compute and increase to total of the token can buy
