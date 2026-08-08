// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LBFactory} from "joe-v2/LBFactory.sol";
import {LBPair} from "joe-v2/LBPair.sol";
import {LBRouter} from "joe-v2/LBRouter.sol";
import {LBQuoter} from "joe-v2/LBQuoter.sol";
import {ILBFactory} from "joe-v2/interfaces/ILBFactory.sol";
import {ILBLegacyFactory} from "joe-v2/interfaces/ILBLegacyFactory.sol";
import {ILBLegacyRouter} from "joe-v2/interfaces/ILBLegacyRouter.sol";
import {IJoeFactory} from "joe-v2/interfaces/IJoeFactory.sol";
import {IWNATIVE} from "joe-v2/interfaces/IWNATIVE.sol";

import {WMON} from "../src/WMON.sol";
import {TestToken} from "../src/TestToken.sol";

/**
 * Stand up a whole Liquidity Book on Monad testnet.
 *
 *   forge script script/DeployLiquidityBook.s.sol \
 *     --rpc-url https://testnet-rpc.monad.xyz --broadcast
 *
 * WHY THIS SCRIPT EXISTS AT ALL
 *
 * `packages/sdk/src/chains.ts` documents the finding: LFJ publishes Liquidity
 * Book addresses for chain 10143 that are byte-identical to mainnet and hold no
 * bytecode. The factory, the router and the quoter are all empty, and so is
 * WMON. There is no Liquidity Book on Monad testnet to integrate with, so the
 * only way to have one is to deploy it.
 *
 * THE ORDER IS NOT NEGOTIABLE
 *
 * Every step below depends on the one before it, and two of them fail in ways
 * that are not obvious:
 *
 *   `setLBPairImplementation` calls `ILBPair(impl).getFactory()` and reverts
 *   unless it returns THIS factory, so the pair implementation must be
 *   constructed with the factory address and cannot be deployed first.
 *
 *   `createLBPair` reverts with `LBFactory__BinStepHasNoPreset` for any bin
 *   step that has no preset, so every step the game can ask for has to be
 *   registered here. It is not lazily created on first use.
 *
 * The sequence mirrors joe-v2's own `test/helpers/TestHelper.sol`, which is the
 * reference implementation the protocol tests itself against. Deviating from it
 * to save a call would mean re-deriving guarantees somebody already established.
 */
contract DeployLiquidityBook is Script {
    /// Monad testnet. Also the only chain this script will run on, see `run`.
    uint256 internal constant TESTNET_CHAIN_ID = 10143;

    /// Local anvil, so the whole sequence can be rehearsed for free.
    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    /// joe-v2's own default, from `test/helpers/TestHelper.sol` line 49.
    uint256 internal constant FLASHLOAN_FEE = 8e14;

    struct Preset {
        uint16 baseFactor;
        uint16 filterPeriod;
        uint16 decayPeriod;
        uint16 reductionFactor;
        uint24 variableFeeControl;
        uint16 protocolShare;
        uint24 maxVolatilityAccumulator;
    }

    /**
     * ONE PRESET PER BIN STEP, AND THEY ARE NOT INTERCHANGEABLE.
     *
     * The first version of this script used a single set of parameters for
     * every bin step, copied from `TestHelper.sol`. Bin steps 1 through 25
     * seeded fine and bin step 100 reverted with `LBPair__MaxTotalFeeExceeded`,
     * because the variable fee is QUADRATIC in the bin step:
     *
     *   baseFee     = baseFactor * binStep * 1e10
     *   variableFee = (maxVolatilityAccumulator * binStep)^2 * varFeeControl/100
     *   total must stay below Constants.MAX_FEE, which is 0.1e18
     *
     * At bin step 100 with a variable fee control of 40,000 that second term is
     * 4.9e17, nearly five times the cap. Which is precisely why joe-v2's own
     * `script/config/bips-config.sol` scales the control DOWN as the bin step
     * grows: 2,000,000 at bin step 1, and 15,000 at bin step 25.
     *
     * Bin steps 1 to 25 below are that file, copied rather than re-derived.
     * Steps 50 and 100 are not in it — joe-v2 calibrated seven presets and
     * stopped — so they are derived here by holding the total fee near the bin
     * step 25 figure, and the arithmetic is stated so it can be checked:
     *
     *   binStep 50   base 5.0e15 + var 1.148e16 = 1.65e16   16% of the cap
     *   binStep 100  base 1.0e16 + var 1.152e16 = 2.15e16   21% of the cap
     *
     * They have to exist because `FALLBACK_BIN_STEPS` offers them and because
     * mainnet really does run a WMON/USDC pool at bin step 100.
     */
    function _presetFor(uint16 binStep) internal pure returns (Preset memory) {
        if (binStep == 1) return Preset(20_000, 10, 120, 5_000, 2_000_000, 0, 100_000);
        if (binStep == 2) return Preset(15_000, 10, 120, 5_000, 500_000, 0, 250_000);
        if (binStep == 5) return Preset(8_000, 30, 600, 5_000, 120_000, 0, 300_000);
        if (binStep == 10) return Preset(10_000, 30, 600, 5_000, 40_000, 0, 350_000);
        if (binStep == 15) return Preset(10_000, 30, 600, 5_000, 30_000, 0, 350_000);
        if (binStep == 20) return Preset(10_000, 30, 600, 5_000, 20_000, 0, 350_000);
        if (binStep == 25) return Preset(10_000, 30, 600, 5_000, 15_000, 0, 350_000);
        if (binStep == 50) return Preset(10_000, 30, 600, 5_000, 3_750, 0, 350_000);
        if (binStep == 100) return Preset(10_000, 30, 600, 5_000, 940, 0, 350_000);

        revert("DeployLiquidityBook: no preset for this bin step");
    }

    /**
     * Every bin step the game can ask for.
     *
     * This list is `FALLBACK_BIN_STEPS` in apps/web/src/config/thresholds.ts,
     * and it has to be a superset of whatever `planRange` can return: that
     * function picks the finest step that fits `MAX_BINS_PER_TX`, and a step it
     * picks but the factory never registered is a revert at the moment the
     * player confirms a deposit. Registering all nine costs nine cheap owner
     * calls once, which is a good trade against that.
     */
    uint16[9] internal binSteps = [1, 2, 5, 10, 15, 20, 25, 50, 100];

    function run() external {
        uint256 chainId = block.chainid;

        // TestToken.mint is open to anyone by design, so this deployment is
        // worthless-by-construction and must never reach a chain where that
        // matters. chains.ts marks mainnet as the chain the app READS and never
        // writes; this is the same rule expressed where it can be enforced.
        require(
            chainId == TESTNET_CHAIN_ID || chainId == ANVIL_CHAIN_ID,
            "DeployLiquidityBook: testnet or anvil only, never mainnet"
        );

        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console.log("chain id  ", chainId);
        console.log("deployer  ", deployer);
        console.log("balance   ", deployer.balance);

        vm.startBroadcast(pk);

        // ---- tokens ---------------------------------------------------------
        // WMON first: LBRouter takes it as a constructor argument and an
        // immutable cannot be filled in afterwards.
        /**
         * WMON is deployed for ONE reason: `LBRouter` takes an `IWNATIVE` in
         * its constructor and stores it immutable. It is not a pool leg here.
         *
         * That is a funding fact, not a design preference. WMON can only be
         * created by sending real MON to `deposit()`, so a pool holding 12,000
         * WMON costs 12,000 faucet MON, and the deployer holds tens. Seeding the
         * volatile leg with a mintable stand-in costs gas alone, which is the
         * difference between a pool set that spans two orders of magnitude of
         * depth and one that is uniformly too thin to clear the game's own
         * liquidity gates.
         *
         * The moment this product grows a real deposit path, the player's
         * embedded wallet will hold faucet MON and a genuine WMON pool becomes
         * worth seeding. There is no such path today (no LBRouter write exists
         * anywhere in apps/), so paying for one now buys nothing.
         */
        WMON wmon = new WMON();

        // 6 decimals, like every real stable leg on Monad. See TestToken.
        TestToken tusd = new TestToken("Test USD", "tUSD", 6);
        /**
         * The volatile legs. Both are stand-ins for a token whose price we can
         * actually READ, which is the whole point of the pair below.
         *
         * An earlier version used a "tCHOG" priced at five cents. Five cents
         * was a number chosen by hand, and a pool seeded at a hand-chosen price
         * makes every dollar figure downstream — TVL, the tracker's depth
         * score, the fee estimate — a restatement of that choice rather than a
         * measurement. tBTC replaces it because cbBTC/USDC is in our own
         * mainnet snapshot and therefore has an observed price.
         *
         * Decimals mirror the real tokens: MON is 18, BTC is 8, tUSD is 6. That
         * is three different widths across two pairs, which is deliberate. A
         * missing decimal conversion is invisible on an 18/18 pair and produces
         * a plausible wrong number everywhere else.
         */
        TestToken tmon = new TestToken("Test MON", "tMON", 18);
        TestToken tbtc = new TestToken("Test BTC", "tBTC", 8);

        // ---- the book -------------------------------------------------------
        LBFactory factory = new LBFactory(deployer, deployer, FLASHLOAN_FEE);
        LBPair pairImplementation = new LBPair(ILBFactory(address(factory)));
        factory.setLBPairImplementation(address(pairImplementation));

        // A pair is always TOKEN / QUOTE, and the factory refuses to create one
        // whose Y leg is not whitelisted here. Both of ours are quote assets
        // because the game wants a WMON/tUSD pool and may want a token/WMON one.
        factory.addQuoteAsset(IERC20(address(tusd)));
        factory.addQuoteAsset(IERC20(address(wmon)));

        for (uint256 i = 0; i < binSteps.length; i++) {
            Preset memory p = _presetFor(binSteps[i]);
            factory.setPreset(
                binSteps[i],
                p.baseFactor,
                p.filterPeriod,
                p.decayPeriod,
                p.reductionFactor,
                p.variableFeeControl,
                p.protocolShare,
                p.maxVolatilityAccumulator,
                // Open, so a pair can be created by an address that is not the
                // factory owner. The keeper deploys but the player's embedded
                // wallet is the one that would ever create a pool later, and it
                // will never be the owner of anything.
                true
            );
        }

        // Legacy arguments are all address(0), and that is correct rather than
        // lazy. These slots point at Trader Joe V1 and Liquidity Book v2.0/v2.1
        // on Avalanche; none of them exist on Monad at any address. The router
        // only reads them inside the legacy swap paths, which this product
        // never calls, and passing a plausible-looking non-zero address would
        // be strictly worse than passing zero: zero reverts loudly.
        LBRouter router = new LBRouter(
            ILBFactory(address(factory)),
            IJoeFactory(address(0)),
            ILBLegacyFactory(address(0)),
            ILBLegacyRouter(address(0)),
            ILBFactory(address(0)),
            IWNATIVE(address(wmon))
        );

        LBQuoter quoter = new LBQuoter(
            address(0), // factoryV1
            address(0), // legacyFactoryV2
            address(0), // factoryV2_1
            address(factory), // factoryV2_2
            address(0), // legacyRouterV2
            address(0), // routerV2_1
            address(router) // routerV2_2
        );

        vm.stopBroadcast();

        // Printed as the exact field names in packages/sdk/src/chains.ts, so
        // transcribing them is a copy rather than a translation. record:deployment
        // reads the broadcast artifact instead, but a human reading a terminal
        // at 11pm deserves the same names too.
        console.log("");
        console.log("wrappedNative", address(wmon));
        console.log("usdc         ", address(tusd));
        console.log("tmon         ", address(tmon));
        console.log("tbtc         ", address(tbtc));
        console.log("lbFactory    ", address(factory));
        console.log("lbRouter     ", address(router));
        console.log("lbQuoter     ", address(quoter));
        console.log("pairImpl     ", address(pairImplementation));
    }
}
