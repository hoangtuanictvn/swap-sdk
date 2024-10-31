use anchor_lang::prelude::*;

declare_id!("CQpZq2RAM6VSEBToH72WY1dFnFaXkUTUdtd7yaPhXtcc");

#[program]
pub mod swap_sdk {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
