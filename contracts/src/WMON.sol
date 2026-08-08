// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * Wrapped MON, because Monad testnet does not have one.
 *
 * This is not a convenience contract. `packages/sdk/src/chains.ts` records the
 * finding that started this whole exercise: the `monad-crypto/protocols`
 * registry publishes a canonical testnet WMON at
 * 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701 and that address holds NO
 * BYTECODE, verified against three independent RPC providers. Thirteen of the
 * fourteen canonical testnet contracts do have code; WMON is the one that does
 * not, and it is the one a Liquidity Book router structurally cannot work
 * without, because `LBRouter` takes an `IWNATIVE` in its constructor.
 *
 * So the wrapped native on our testnet has to be ours. Deployed once by
 * `script/DeployLiquidityBook.s.sol` and recorded in chains.ts like every other
 * address.
 *
 * WETH9 SEMANTICS, OZ MECHANICS
 *
 * `deposit` and `withdraw` are the two functions `IWNATIVE` adds on top of
 * ERC20, and they are the entire contract. Everything else is OpenZeppelin's
 * audited ERC20 rather than a hand-rolled copy of WETH9: the original is from
 * 2015, predates the events and the return values callers now assume, and
 * copying it would mean re-auditing balance arithmetic that OZ already got
 * right. The only thing worth writing by hand here is the native-token edge.
 */
contract WMON is ERC20 {
    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    constructor() ERC20("Wrapped MON", "WMON") {}

    /// @dev Wrapping is the entire reason to send MON here, so a bare transfer
    ///      does the obvious thing instead of trapping the funds.
    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        // Burn FIRST, then send. The call below hands control to the caller,
        // and a caller that re-enters before its balance dropped would withdraw
        // the same MON twice. `_burn` reverting on an over-withdraw is what
        // makes the reentrancy harmless rather than merely unlikely.
        _burn(msg.sender, amount);

        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "WMON: MON transfer failed");

        emit Withdrawal(msg.sender, amount);
    }
}
