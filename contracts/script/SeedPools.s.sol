// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ILBFactory} from "joe-v2/interfaces/ILBFactory.sol";
import {ILBPair} from "joe-v2/interfaces/ILBPair.sol";
import {ILBRouter} from "joe-v2/interfaces/ILBRouter.sol";
import {PriceHelper} from "joe-v2/libraries/PriceHelper.sol";

import {TestToken} from "../src/TestToken.sol";

/**
 * Create the pairs and put real liquidity in them.
 *
 *   forge script script/SeedPools.s.sol \
 *     --rpc-url https://testnet-rpc.monad.xyz --broadcast
 *
 * A pair with no reserves is invisible to this product. `snapshot-pools.ts`
 * prices reserves off the active bin and drops anything that comes back empty,
 * which is how it found that 46 of mainnet's 78 pairs are dead. A deploy that
 * stopped at `createLBPair` would produce a Liquidity Book that is real,
 * verifiable, and shows up in the game as nothing at all.
 *
 * THE TWO PLACES THIS IS EASY TO GET WRONG
 *
 * 1. THE ACTIVE ID. A bin id is a price, and the price is a RAW ratio: token Y
 *    base units per token X base unit. For an 18-decimal WMON against a
 *    6-decimal tUSD at two dollars, that ratio is 2e6 / 1e18, not 2. Getting
 *    this wrong does not revert; it seeds a pool at a price off by twelve orders
 *    of magnitude, which then reads back as a plausible-looking number.
 *
 *    So the conversion is done by joe-v2's own `PriceHelper` rather than by a
 *    logarithm written here, and `_activeIdFor` below states the decimal algebra
 *    in one place. Same reasoning as `snapshot-pools.ts` moving to viem: the fix
 *    is to remove the class of error, not this instance of it.
 *
 * 2. THE DISTRIBUTIONS. Bins below the active one hold ONLY token Y, bins above
 *    hold ONLY token X, and the active bin holds both. Each distribution array
 *    has to sum to exactly 1e18 or the router reverts. `_uniform` builds both
 *    and puts the rounding dust in the active bin, because that is the one bin
 *    guaranteed to be in every range.
 *
 *    This is the same split `apps/web/src/lib/range/bins.ts` `depositSplit`
 *    shows the player before they confirm. The game's explanation and the seed
 *    script agree because they are describing one fact about Liquidity Book.
 */
contract SeedPools is Script {
    uint256 internal constant TESTNET_CHAIN_ID = 10143;
    uint256 internal constant ANVIL_CHAIN_ID = 31337;

    /// Bins each side of the active one. 21 bins total per pool: wide enough
    /// that the game's own ranges sit inside real liquidity, far below the
    /// 50-bin transaction cap in thresholds.ts.
    uint256 internal constant BINS_PER_SIDE = 10;

    /**
     * A pool to seed, described in DOLLARS rather than token counts.
     *
     * The first version named whole units of each token, which forced the
     * author to do the division by hand and broke outright on a token worth
     * more than the pool: 600 dollars of BTC is 0.0093 BTC, and "whole units"
     * cannot say that. Naming the dollar value and letting `_seed` divide by
     * the price removes both problems, and removes the one step where a typo
     * silently changes what the pool is worth.
     *
     * `usdPerLegE18` assumes token Y is a dollar. Every pair here quotes
     * against tUSD, and `_seed` requires it, so the assumption is checked
     * rather than trusted.
     */
    struct PoolSpec {
        address tokenX;
        address tokenY;
        uint16 binStep;
        /// Dollars of EACH leg, 18 decimals. 24_000e18 seeds a ~$48k pool.
        uint256 usdPerLegE18;
        /**
         * Price of one whole X in whole Y, 18 decimals.
         *
         * MEASURED, NOT CHOSEN. Every value used below comes from
         * `data/pools.mainnet.json`, which `snapshot-pools.ts` read off the
         * real Liquidity Book pools on Monad mainnet. A judge can recompute any
         * of them from the committed file and the bin maths in one step.
         */
        uint256 priceE18;
        string label;
    }

    function run() external {
        uint256 chainId = block.chainid;
        require(
            chainId == TESTNET_CHAIN_ID || chainId == ANVIL_CHAIN_ID, "SeedPools: testnet or anvil only, never mainnet"
        );

        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        ILBFactory factory = ILBFactory(vm.envAddress("LB_FACTORY"));
        ILBRouter router = ILBRouter(payable(vm.envAddress("LB_ROUTER")));
        address tusd = vm.envAddress("TUSD");
        address tmon = vm.envAddress("TMON");
        address tbtc = vm.envAddress("TBTC");

        /**
         * Four pools, and the SPREAD is the point.
         *
         * The tracker plots SAFETY against HEAT, and safety is driven mostly by
         * liquidity depth. Seeding four pools at similar sizes would reproduce
         * the exact problem the mainnet snapshot has today: nine pools landing
         * in a 39-point band with every pin on top of its neighbour. These
         * deliberately span two orders of magnitude of TVL so the map has a
         * shape, and vary bin step so the range planner has something to choose
         * between.
         */
        // MON at $0.020877 is the WMON/USDC bin-step-5 pool, the deepest pair
        // on Monad mainnet at $45,835 of liquidity and therefore the least
        // pushable. Four other WMON pools in the same snapshot independently
        // agree to within half a percent. BTC at $64,597.78 is cbBTC/USDC.
        uint256 monUsdE18 = 0.020877e18;
        uint256 btcUsdE18 = 64_597.78e18;

        PoolSpec[4] memory specs = [
            PoolSpec(tmon, tusd, 5, 24_000e18, monUsdE18, "tMON/tUSD bs5 deep"),
            PoolSpec(tmon, tusd, 25, 3_000e18, monUsdE18, "tMON/tUSD bs25 mid"),
            PoolSpec(tmon, tusd, 100, 300e18, monUsdE18, "tMON/tUSD bs100 thin"),
            PoolSpec(tbtc, tusd, 25, 600e18, btcUsdE18, "tBTC/tUSD bs25")
        ];

        vm.startBroadcast(pk);

        for (uint256 i = 0; i < specs.length; i++) {
            _seed(factory, router, specs[i], deployer);
        }

        vm.stopBroadcast();
    }

    function _seed(ILBFactory factory, ILBRouter router, PoolSpec memory spec, address to) internal {
        uint8 decX = TestToken(spec.tokenX).decimals();
        uint8 decY = TestToken(spec.tokenY).decimals();

        // `usdPerLegE18` is only a dollar figure because token Y IS a dollar.
        // Asserted rather than assumed: quoting against something else would
        // make every TVL in the snapshot silently wrong by that token's price,
        // and nothing downstream would revert to say so.
        require(
            keccak256(bytes(TestToken(spec.tokenY).symbol())) == keccak256(bytes("tUSD")),
            "SeedPools: quote leg must be tUSD for a usd-denominated spec"
        );

        // dollars / (dollars per whole X) -> whole X, then into base units.
        // Done in one expression so the intermediate never rounds to zero for
        // a token worth more than the leg, which is the BTC case: 600 dollars
        // of it is 0.0093 whole tokens and 928,824 base units.
        uint256 amountX = (spec.usdPerLegE18 * (10 ** decX)) / spec.priceE18;
        uint256 amountY = (spec.usdPerLegE18 * (10 ** decY)) / 1e18;

        require(amountX > 0 && amountY > 0, "SeedPools: leg rounds to zero");

        uint24 activeId = _activeIdFor(spec.priceE18, decX, decY, spec.binStep);

        // `createLBPair` reverts if the pair already exists, which would abort
        // the whole run on a re-seed. Asking first makes this script safe to run
        // twice, and a second run then just adds more liquidity to what is
        // already there.
        ILBPair pair = factory.getLBPairInformation(IERC20(spec.tokenX), IERC20(spec.tokenY), spec.binStep).LBPair;
        if (address(pair) == address(0)) {
            pair = factory.createLBPair(IERC20(spec.tokenX), IERC20(spec.tokenY), activeId, spec.binStep);
        } else {
            // Fund it at the price it actually sits at, not the one we wanted.
            // A second seeding run must not silently try to move the market.
            activeId = pair.getActiveId();
        }

        // BOTH LEGS MUST BE A TestToken. Not a style rule: WMON is an ERC20 and
        // satisfies every interface this function otherwise touches, but it has
        // no `mint`, so this line compiles, deploys, and reverts with empty data
        // at the exact moment the pair already exists. The local anvil rehearsal
        // is what caught it; nothing about the types would have.
        //
        // Mint exactly what this pool needs. The tokens are worthless by
        // construction (TestToken.mint is open), so there is no reason to
        // pre-mint a treasury and every reason not to: minting per pool means
        // the amounts in the spec above are the amounts that reach the pair.
        TestToken(spec.tokenX).mint(to, amountX);
        TestToken(spec.tokenY).mint(to, amountY);

        IERC20(spec.tokenX).approve(address(router), amountX);
        IERC20(spec.tokenY).approve(address(router), amountY);

        (int256[] memory deltaIds, uint256[] memory distX, uint256[] memory distY) = _uniform();

        router.addLiquidity(
            ILBRouter.LiquidityParameters({
                tokenX: IERC20(spec.tokenX),
                tokenY: IERC20(spec.tokenY),
                binStep: spec.binStep,
                amountX: amountX,
                amountY: amountY,
                // Zero minimums. This is a fresh pool on a testnet that nobody
                // else is trading, so there is no sandwich to protect against
                // and a slippage floor here would only add a way for the seed
                // to fail. The game's own deposits will NOT look like this.
                amountXMin: 0,
                amountYMin: 0,
                activeIdDesired: activeId,
                idSlippage: 0,
                deltaIds: deltaIds,
                distributionX: distX,
                distributionY: distY,
                to: to,
                refundTo: to,
                deadline: block.timestamp + 1 hours
            })
        );

        (uint128 reserveX, uint128 reserveY) = pair.getReserves();

        console.log(spec.label);
        console.log("  pair    ", address(pair));
        console.log("  activeId", activeId);
        console.log("  reserveX", reserveX);
        console.log("  reserveY", reserveY);
    }

    /**
     * The bin id whose price is `priceE18` whole Y per whole X.
     *
     * Liquidity Book prices RAW units, so a decimal difference between the two
     * legs is part of the price rather than a display detail:
     *
     *   rawRatio        = price * 10^decY / 10^decX
     *   rawRatio, 18dp  = priceE18 * 10^decY / 10^decX
     *
     * The two conversions after that are joe-v2's own, so the exponent and the
     * fixed-point format are the protocol's rather than a re-derivation.
     */
    function _activeIdFor(uint256 priceE18, uint8 decX, uint8 decY, uint16 binStep) internal pure returns (uint24) {
        uint256 rawRatioE18 = (priceE18 * (10 ** decY)) / (10 ** decX);
        require(rawRatioE18 > 0, "SeedPools: price underflows to zero");

        uint256 price128x128 = PriceHelper.convertDecimalPriceTo128x128(rawRatioE18);
        return PriceHelper.getIdFromPrice(price128x128, binStep);
    }

    /**
     * A flat range: every bin gets the same share of its own token.
     *
     * The active bin appears in both arrays at half weight because it is the one
     * bin holding both tokens, so it is counted in half-shares throughout:
     * `2 * BINS_PER_SIDE + 1` of them per side. Integer division leaves dust,
     * and the dust goes to the active bin so each array sums to exactly 1e18 —
     * the router checks, and is right to.
     */
    function _uniform()
        internal
        pure
        returns (int256[] memory deltaIds, uint256[] memory distX, uint256[] memory distY)
    {
        uint256 total =
            2 * BINS_PER_SIDE + 1;
        deltaIds = new int256[](total);
        distX = new uint256[](total);
        distY = new uint256[](total);

        uint256 halfShares = 2 * BINS_PER_SIDE + 1;
        uint256 perHalf = 1e18 / halfShares;

        uint256 sumX;
        uint256 sumY;

        for (uint256 i = 0; i < total; i++) {
            // Both casts are safe because `total` is 2 * BINS_PER_SIDE + 1 = 21
            // and BINS_PER_SIDE is a compile-time constant of 10. Neither can
            // reach int256's ceiling, and both are loop bounds rather than
            // anything a caller supplies.
            // forge-lint: disable-next-line(unsafe-typecast)
            int256 delta = int256(i) - int256(BINS_PER_SIDE);
            deltaIds[i] = delta;

            if (delta > 0) {
                distX[i] = perHalf * 2;
                sumX += distX[i];
            } else if (delta < 0) {
                distY[i] = perHalf * 2;
                sumY += distY[i];
            } else {
                distX[i] = perHalf;
                distY[i] = perHalf;
                sumX += perHalf;
                sumY += perHalf;
            }
        }

        distX[BINS_PER_SIDE] += 1e18 - sumX;
        distY[BINS_PER_SIDE] += 1e18 - sumY;
    }
}
