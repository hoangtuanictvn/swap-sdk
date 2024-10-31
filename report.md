# A simple report about in technical perspect to build an Meme index fund

### About the ability to buy a bulk of tokens in Atomic transaction?

- How we can buy a bulk of Solana token via Raydium?
  - Lets see in the custom-swap.ts example, its figure out how we can buy a bulk of tokens.
  - At this point, we just buy 13 tokens only - because of the transaction package size limitation of 1232 bytes - we have a workaround to have more token at there via on address lookup tables, so don't worry abt this too much.
  - You can check the success TX out there: https://solscan.io/tx/5DBY3sCvkAb6vSHwz3z3orKdQzQWAkx2NsiexwKJaAjqMNd4xEBqVfALyYYhD9YA4oXzvxhnwW5FQrAWSFp9r1eb?cluster=devnet

- How much we can buy Atomic?
  - Based on my double check, we only able to buy Atomic in 1 transaction
  - In the Tx above, we used around 420,365 so we can have the rest of 1.4 M CU - 4.2CU.
  - For a simple caculation: Total tokens can swap = 14*13/4.2 = 43 tokens in 1 txs

### Summary
- We can buy around 30 - 39 tx in Atomic way - So to buy more token I have 1 proposal as below:
  - If we have 90 tokens, we will do as follow:
    - For each buy we will have a separate vault - called temporary vault account (1)
    - Split the buy tx into 3 tx, each tx will save state of its status in a sharing state counter - example we will need 3 tx complete and the counter need to be 3 (2)
    - Add more 4th tx, this tx will check the state to ensure the counter will be 3, if not we will sell all token in (1) and close the vault account to return the storage cost to user.
  - The risks:
    - The risk is tx can be delivered in some way, and stuck in the middle of the buy and sell.
    - Need more deep research on this, may it longer than 1 day.

### Appendix:
- [What are the Current Compute Limitations?](https://solana.com/developers/guides/advanced/how-to-optimize-compute#what-are-the-current-compute-limitations)
    - Max Compute per block: 48 million CU
    - Max Compute per account per block: 12 million CU
    - Max Compute per transaction: 1.4 million CU
