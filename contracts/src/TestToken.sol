// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * A mintable ERC20 for the seeded pools, with a decimals value that is not 18.
 *
 * WHY NOT JUST USE TESTNET USDC
 *
 * Monad testnet's USDC at 0x534b2f3A21130d7a60830c2Df862319e593943A3 is real
 * and has bytecode (chains.ts confirms it), but it is not mintable by us. A
 * pool needs BOTH legs funded, and a quote leg we cannot mint is a quote leg we
 * have to acquire before we can seed anything. That turns a scripted deploy
 * into a scavenger hunt on the morning of a demo.
 *
 * WHY DECIMALS ARE A CONSTRUCTOR ARGUMENT
 *
 * Every real stable leg on Monad is 6 decimals and every wrapped native is 18.
 * `lib/range/bins.ts` and the snapshot script both convert with the token's own
 * decimals, and a mismatch there is exactly the kind of bug that produces a
 * plausible wrong number instead of a revert. Seeding against an 18-decimal
 * stand-in for a 6-decimal token would let that bug hide until mainnet, so the
 * test token carries the real shape.
 */
contract TestToken is ERC20 {
    uint8 private immutable _DECIMALS;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _DECIMALS = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }

    /**
     * Open. Anyone can mint any amount.
     *
     * This contract exists to seed pools on a testnet whose native token comes
     * from a public faucet, so there is nothing here to protect: an attacker's
     * best case is minting themselves a token that is worthless by construction.
     * An owner check would only add a way for the seeding script to fail.
     *
     * It is also why nothing in this file may EVER be deployed to mainnet, and
     * why `DeployLiquidityBook.s.sol` asserts the chain id before it runs.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
