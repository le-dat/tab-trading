// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/TapOrder.sol";
import "../../contracts/PayoutPool.sol";
import "../../contracts/PriceFeedAdapter.sol";
import "../../contracts/mocks/MockV3Aggregator.sol";

contract TapOrderTest is Test {
    // -----------------------------------------------------------------------
    // Contracts
    // -----------------------------------------------------------------------
    TapOrder public tapOrder;
    PayoutPool public payoutPool;
    PriceFeedAdapter public priceFeedAdapter;
    MockV3Aggregator public btcFeed;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------
    string constant BTC_ASSET = "BTC/USD";
    uint256 constant DURATION_1M = 60;
    uint256 constant DURATION_5M = 300;
    uint256 constant DURATION_15M = 900;
    uint256 constant MULTIPLIER_2X = 200;
    uint256 constant MULTIPLIER_5X = 500;
    uint256 constant MULTIPLIER_10X = 1000;
    uint256 constant INITIAL_POOL_FUND = 100 ether;
    uint256 constant MIN_STAKE = 0.001 ether;
    uint256 constant MAX_STAKE = 0.1 ether;

    // -----------------------------------------------------------------------
    // Test state
    // -----------------------------------------------------------------------
    address owner;
    address user;
    address other;

    // -----------------------------------------------------------------------
    // setUp
    // -----------------------------------------------------------------------
    function setUp() public {
        owner = address(this);
        user = makeAddr("user");
        other = makeAddr("other");

        // Deploy PriceFeedAdapter
        priceFeedAdapter = new PriceFeedAdapter();

        // Deploy PayoutPool
        payoutPool = new PayoutPool();

        // Ensure this test contract has DEFAULT_ADMIN_ROLE on PayoutPool
        // (TapOrder.pause()/unpause() now coordinate with PayoutPool)
        payoutPool.grantRole(payoutPool.DEFAULT_ADMIN_ROLE(), address(this));

        // Deploy MockV3Aggregator for BTC price feed
        btcFeed = new MockV3Aggregator(65000 * 10**8); // $65,000 with 8 decimals

        // Set feed in adapter
        priceFeedAdapter.setFeed(BTC_ASSET, address(btcFeed));

        // Deploy TapOrder
        tapOrder = new TapOrder(address(priceFeedAdapter), address(payoutPool));

        // Grant PAYOUT_ROLE to TapOrder so it can call PayoutPool.payout()
        bytes32 payoutRole = payoutPool.PAYOUT_ROLE();
        payoutPool.grantRole(payoutRole, address(tapOrder));

        // Grant TapOrder the admin role so pause/unpause coordination works
        payoutPool.grantRole(payoutPool.DEFAULT_ADMIN_ROLE(), address(tapOrder));

        // Fund PayoutPool with 100 ETH
        payoutPool.deposit{value: INITIAL_POOL_FUND}(address(btcFeed));

        // Whitelist BTC asset in TapOrder
        tapOrder.addAsset(BTC_ASSET, address(btcFeed));
    }

    // -----------------------------------------------------------------------
    // Helper functions
    // -----------------------------------------------------------------------
    function _updateBtcPrice(int256 price) internal {
        btcFeed.updateAnswer(price);
    }

    function _createOrder(
        address depositor,
        int256 targetPrice,
        bool isAbove,
        uint256 durationSecs,
        uint256 multiplierBps,
        uint256 stake
    ) internal returns (uint256 orderId) {
        uint256 nextIdBefore = tapOrder.nextOrderId();
        vm.deal(depositor, stake);
        vm.prank(depositor);
        tapOrder.createOrder{value: stake}(
            BTC_ASSET,
            targetPrice,
            isAbove,
            durationSecs,
            multiplierBps
        );
        orderId = nextIdBefore; // nextOrderId was incremented after the call
    }

    // -----------------------------------------------------------------------
    // Unit Tests: createOrder
    // -----------------------------------------------------------------------
    function test_createOrder_assignsIncrementingOrderId() public {
        uint256 id1 = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);
        uint256 id2 = _createOrder(user, 67000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);
        uint256 id3 = _createOrder(user, 68000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
    }

    function test_createOrder_storesOrderCorrectly() public {
        uint256 orderId = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        (
            address orderUser,
            string memory assetKey,
            int256 targetPrice,
            bool isAbove,
            uint256 stake,
            uint256 multiplierBps,
            uint256 expiry,
            TapOrder.OrderStatus status
        ) = tapOrder.orders(orderId);

        assertEq(orderUser, user);
        assertEq(assetKey, BTC_ASSET);
        assertEq(targetPrice, 66000 * 10**8);
        assertTrue(isAbove);
        assertEq(stake, 0.01 ether);
        assertEq(multiplierBps, MULTIPLIER_5X);
        assertEq(uint8(status), uint8(TapOrder.OrderStatus.OPEN));
        assertGt(expiry, block.timestamp);
    }

    function test_createOrder_emitsOrderCreatedEvent() public {
        vm.deal(user, 0.01 ether);
        vm.prank(user);

        vm.expectEmit(true, true, true, true);
        emit TapOrder.OrderCreated({
            orderId: 1,
            user: user,
            assetKey: BTC_ASSET,
            targetPrice: 66000 * 10**8,
            isAbove: true,
            stake: 0.01 ether,
            multiplierBps: MULTIPLIER_5X,
            expiry: block.timestamp + DURATION_1M
        });

        tapOrder.createOrder{value: 0.01 ether}(
            BTC_ASSET,
            66000 * 10**8,
            true,
            DURATION_1M,
            MULTIPLIER_5X
        );
    }

    function test_createOrder_revertsWhenAssetNotWhitelisted() public {
        vm.deal(user, 0.01 ether);
        vm.prank(user);

        vm.expectRevert(abi.encodeWithSelector(TapOrder.AssetNotWhitelisted.selector, "ETH/USD"));
        tapOrder.createOrder{value: 0.01 ether}(
            "ETH/USD",
            4000 * 10**8,
            true,
            DURATION_1M,
            MULTIPLIER_2X
        );
    }

    function test_createOrder_revertsWhenInvalidMultiplier() public {
        vm.deal(user, 0.01 ether);
        vm.prank(user);

        vm.expectRevert(abi.encodeWithSelector(TapOrder.InvalidMultiplier.selector, 300));
        tapOrder.createOrder{value: 0.01 ether}(
            BTC_ASSET,
            66000 * 10**8,
            true,
            DURATION_1M,
            300 // Not an allowed multiplier
        );
    }

    function test_createOrder_revertsWhenInvalidDuration() public {
        vm.deal(user, 0.01 ether);
        vm.prank(user);

        vm.expectRevert(abi.encodeWithSelector(TapOrder.InvalidDuration.selector, 120));
        tapOrder.createOrder{value: 0.01 ether}(
            BTC_ASSET,
            66000 * 10**8,
            true,
            120, // Not 60, 300, or 900
            MULTIPLIER_2X
        );
    }

    function test_createOrder_revertsWhenZeroStake() public {
        vm.deal(user, 0);
        vm.prank(user);

        vm.expectRevert(TapOrder.ZeroStake.selector);
        tapOrder.createOrder(
            BTC_ASSET,
            66000 * 10**8,
            true,
            DURATION_1M,
            MULTIPLIER_2X
        );
    }

    function test_createOrder_revertsWhenInsufficientPoolLiquidity() public {
        // Deploy a fresh pool with limited funds to test insufficient liquidity
        PayoutPool smallPool = new PayoutPool();
        PriceFeedAdapter adapter2 = new PriceFeedAdapter();
        adapter2.setFeed(BTC_ASSET, address(btcFeed));
        TapOrder tapOrder2 = new TapOrder(address(adapter2), address(smallPool));

        // Grant payout role
        bytes32 payoutRole = smallPool.PAYOUT_ROLE();
        smallPool.grantRole(payoutRole, address(tapOrder2));

        // Fund pool with only 0.0005 ETH
        smallPool.deposit{value: 0.0005 ether}(address(btcFeed));

        // Add asset to new TapOrder
        tapOrder2.addAsset(BTC_ASSET, address(btcFeed));

        // With 5x multiplier and MAX_STAKE (0.1 ETH):
        // payout = 0.1 * 500 / 10000 = 0.0005 ETH = pool balance (exact, not over)
        // Use 10x multiplier: payout = 0.1 * 1000 / 10000 = 0.001 ETH > 0.0005 ETH pool
        vm.deal(user, 0.1 ether);
        vm.prank(user);

        uint256 stake = 0.1 ether; // MAX_STAKE
        uint256 payout = (stake * MULTIPLIER_10X) / 10000; // 0.001 ETH

        vm.expectRevert(abi.encodeWithSelector(TapOrder.InsufficientLiquidity.selector, payout, 0.0005 ether));
        tapOrder2.createOrder{value: stake}(
            BTC_ASSET,
            70000 * 10**8,
            true,
            DURATION_1M,
            MULTIPLIER_10X
        );
    }

    // -----------------------------------------------------------------------
    // Unit Tests: settleOrder - WIN scenarios
    // -----------------------------------------------------------------------
    function test_settleOrder_winsWhenPriceTouchesTargetFromAbove() public {
        // Create order: target = 66000, isAbove = true (expecting price to go UP to target)
        uint256 orderId = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        // Update price to touch target (inclusive)
        _updateBtcPrice(66000 * 10**8);

        tapOrder.settleOrder(orderId);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status
        ) = tapOrder.orders(orderId);

        assertEq(uint8(status), uint8(TapOrder.OrderStatus.WON));
    }

    function test_settleOrder_winsWhenPriceExceedsTargetFromAbove() public {
        uint256 orderId = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        // Update price to exceed target
        _updateBtcPrice(66500 * 10**8);

        tapOrder.settleOrder(orderId);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status
        ) = tapOrder.orders(orderId);

        assertEq(uint8(status), uint8(TapOrder.OrderStatus.WON));
    }

    function test_settleOrder_winsWhenPriceTouchesTargetFromBelow() public {
        // Create order: target = 64000, isAbove = false (expecting price to go DOWN to target)
        uint256 orderId = _createOrder(user, 64000 * 10**8, false, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        // Update price to touch target
        _updateBtcPrice(64000 * 10**8);

        tapOrder.settleOrder(orderId);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status
        ) = tapOrder.orders(orderId);

        assertEq(uint8(status), uint8(TapOrder.OrderStatus.WON));
    }

    function test_settleOrder_winsWhenPriceGapsThroughTarget() public {
        // Create order: target = 65000, isAbove = true
        uint256 orderId = _createOrder(user, 65000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        // Price was at 64000, now jumps to 66000 (gapping through 65000 target)
        _updateBtcPrice(66000 * 10**8);

        tapOrder.settleOrder(orderId);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status
        ) = tapOrder.orders(orderId);

        assertEq(uint8(status), uint8(TapOrder.OrderStatus.WON));
    }

    // -----------------------------------------------------------------------
    // Unit Tests: settleOrder - LOST scenarios
    // -----------------------------------------------------------------------
    function test_settleOrder_losesWhenExpiryReachedWithoutTouch() public {
        uint256 orderId = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        // Warp past expiry without price touching
        vm.warp(block.timestamp + DURATION_1M + 1);
        _updateBtcPrice(64500 * 10**8); // Never touched 66000

        tapOrder.settleOrder(orderId);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status
        ) = tapOrder.orders(orderId);

        assertEq(uint8(status), uint8(TapOrder.OrderStatus.LOST));
    }

    // -----------------------------------------------------------------------
    // Unit Tests: settleOrder - Permissionless
    // -----------------------------------------------------------------------
    function test_settleOrder_isPermissionless() public {
        uint256 orderId = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        _updateBtcPrice(66000 * 10**8);

        // 'other' is not the owner — settleOrder should still succeed (permissionless)
        vm.prank(other);
        tapOrder.settleOrder(orderId);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status
        ) = tapOrder.orders(orderId);

        assertEq(uint8(status), uint8(TapOrder.OrderStatus.WON));
    }

    // -----------------------------------------------------------------------
    // Unit Tests: settleOrder - Edge cases / Idempotency
    // -----------------------------------------------------------------------
    function test_settleOrder_revertsWhenCalledTwice() public {
        uint256 orderId = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        _updateBtcPrice(66000 * 10**8);
        tapOrder.settleOrder(orderId);

        // Second call reverts with OrderNotOpen because status check comes before settled[] check
        vm.expectRevert(abi.encodeWithSelector(TapOrder.OrderNotOpen.selector, orderId, 1));
        tapOrder.settleOrder(orderId);
    }

    function test_settleOrder_revertsWhenFeedIsStale() public {
        uint256 orderId = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        // Warp 61 seconds into the future so the feed is definitely stale when settled
        vm.warp(block.timestamp + 61 seconds);

        // Set price to a value that would be a WIN, but with a stale timestamp (current - 61s)
        btcFeed.updateAnswerAndTimestamp(66000 * 10**8, block.timestamp - 61 seconds);

        // Price feed is stale (>60s old) — settleOrder must revert
        vm.expectRevert(abi.encodeWithSelector(TapOrder.StalePriceFeed.selector, BTC_ASSET));
        tapOrder.settleOrder(orderId);
    }

    function test_settleOrder_revertsWhenOrderNotOpen() public {
        uint256 orderId = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        // Settle first
        _updateBtcPrice(66000 * 10**8);
        tapOrder.settleOrder(orderId);

        // Try to settle again - should revert with OrderNotOpen (status check comes first)
        vm.expectRevert(abi.encodeWithSelector(TapOrder.OrderNotOpen.selector, orderId, 1));
        tapOrder.settleOrder(orderId);
    }

    // -----------------------------------------------------------------------
    // Unit Tests: batchSettle
    // -----------------------------------------------------------------------
    function test_batchSettle_handlesMixedResults() public {
        // Order 1: longer duration (15M), won't expire with our warp
        uint256 orderId1 = _createOrder(user, 66000 * 10**8, true, DURATION_15M, MULTIPLIER_5X, 0.01 ether);
        _updateBtcPrice(66000 * 10**8);

        // Order 2: shorter duration (1M), will expire with our warp
        uint256 orderId2 = _createOrder(user, 67000 * 10**8, true, DURATION_1M, MULTIPLIER_5X, 0.01 ether);

        // Warp past order 2's expiry but NOT past order 1's
        vm.warp(block.timestamp + DURATION_1M + 1);

        // Update price (stale check requires fresh price)
        _updateBtcPrice(65000 * 10**8);

        uint256[] memory orderIds = new uint256[](2);
        orderIds[0] = orderId1;
        orderIds[1] = orderId2;

        tapOrder.batchSettle(orderIds);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status1
        ) = tapOrder.orders(orderId1);
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status2
        ) = tapOrder.orders(orderId2);

        // Order 1: NOT expired (62 < 901), price 65000 < 66000 → stays OPEN (per expiry change)
        // Order 2: EXPIRED (62 >= 61), price 65000 < 67000 → LOST
        assertEq(uint8(status1), uint8(TapOrder.OrderStatus.OPEN));
        assertEq(uint8(status2), uint8(TapOrder.OrderStatus.LOST));
    }

    // -----------------------------------------------------------------------
    // Unit Tests: pause / unpause
    // -----------------------------------------------------------------------
    function test_pause_preventsNewOrders() public {
        tapOrder.pause();

        vm.deal(user, 0.01 ether);
        vm.prank(user);

        // OpenZeppelin v5 uses EnforcedPause() instead of "Pausable: paused"
        vm.expectRevert();
        tapOrder.createOrder{value: 0.01 ether}(
            BTC_ASSET,
            66000 * 10**8,
            true,
            DURATION_1M,
            MULTIPLIER_2X
        );
    }

    function test_unpause_allowsNewOrders() public {
        tapOrder.pause();
        tapOrder.unpause();

        uint256 orderId = _createOrder(user, 66000 * 10**8, true, DURATION_1M, MULTIPLIER_2X, 0.01 ether);
        assertEq(orderId, 1);
    }

    // -----------------------------------------------------------------------
    // Fuzz Tests
    // -----------------------------------------------------------------------
    function testFuzz_createOrder_payoutNeverOverflows(
        uint256 stake,
        uint256 multiplierBps
    ) public {
        // Bound stake to the MIN_STAKE..MAX_STAKE range
        stake = bound(stake, MIN_STAKE, MAX_STAKE);

        // Use only valid multipliers
        multiplierBps = multiplierBps % 3 == 0
            ? (multiplierBps % 3 == 0 ? MULTIPLIER_2X : MULTIPLIER_5X)
            : MULTIPLIER_10X;
        if (multiplierBps == 0) multiplierBps = MULTIPLIER_2X;

        vm.deal(user, stake + 1 ether);

        uint256 payout = (stake * multiplierBps) / 10000;

        // Should not overflow - this is the key fuzz test
        assertEq(payout, (stake * multiplierBps) / 10000);

        // Only attempt createOrder if pool can cover the payout
        if (payoutPool.getBalance(address(btcFeed)) >= payout) {
            vm.prank(user);
            tapOrder.createOrder{value: stake}(
                BTC_ASSET,
                66000 * 10**8,
                true,
                DURATION_1M,
                multiplierBps
            );
        }
    }

    function testFuzz_settleOrder_priceAboveOrBelow(
        int256 currentPrice,
        int256 targetPrice,
        bool isAbove
    ) public {
        // Bound prices to reasonable range ($1,000 to $1,000,000)
        currentPrice = bound(currentPrice, 1000 * 10**8, 1_000_000 * 10**8);
        targetPrice = bound(targetPrice, 1000 * 10**8, 1_000_000 * 10**8);

        // Skip if prices are equal to avoid ambiguity
        vm.assume(currentPrice != targetPrice);

        // Ensure shouldWin aligns with isAbove direction for meaningful test
        vm.assume(isAbove ? (currentPrice >= targetPrice) : (currentPrice <= targetPrice));

        uint256 orderId = _createOrder(user, targetPrice, isAbove, DURATION_1M, MULTIPLIER_2X, 0.01 ether);

        // Warp past expiry so LOST can happen (otherwise only WON is possible)
        (, , , , , , uint256 expiry, ) = tapOrder.orders(orderId);
        vm.warp(expiry + 1);

        _updateBtcPrice(currentPrice);
        tapOrder.settleOrder(orderId);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status
        ) = tapOrder.orders(orderId);

        bool shouldWin = isAbove ? (currentPrice >= targetPrice) : (currentPrice <= targetPrice);
        assertEq(
            uint8(status),
            shouldWin ? uint8(TapOrder.OrderStatus.WON) : uint8(TapOrder.OrderStatus.LOST)
        );
    }

    function testFuzz_expiryLogic(
        uint256 durationSelector,
        uint256 warpCase
    ) public {
        // Select from valid durations
        uint256 duration;
        if (durationSelector % 3 == 0) {
            duration = DURATION_1M;
        } else if (durationSelector % 3 == 1) {
            duration = DURATION_5M;
        } else {
            duration = DURATION_15M;
        }

        // Create order
        uint256 orderId = _createOrder(user, 66000 * 10**8, true, duration, MULTIPLIER_2X, 0.01 ether);

        // Read the actual expiry from the order
        (, , , , , , uint256 expiry, ) = tapOrder.orders(orderId);

        // warpCase determines:
        // 0 = before expiry (should be OPEN)
        // 1 = at expiry (should be LOST since price never touched)
        // 2 = past expiry (should be LOST)
        uint256 caseType = warpCase % 3;

        // Only test cases where we can safely warp
        if (caseType == 0) {
            // Before expiry: warp to expiry - 1 (but not before current time)
            if (expiry > block.timestamp + 1) {
                vm.warp(expiry - 1);
            } else {
                return; // Can't go back in time, skip
            }
        } else if (caseType == 1) {
            // At expiry
            vm.warp(expiry);
        } else {
            // Past expiry
            vm.warp(expiry + 1);
        }

        _updateBtcPrice(64500 * 10**8); // Never touched target
        tapOrder.settleOrder(orderId);

        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            TapOrder.OrderStatus status
        ) = tapOrder.orders(orderId);

        // At or past expiry should be LOST (price never touched)
        bool shouldBeExpired = caseType >= 1;
        assertEq(
            uint8(status),
            shouldBeExpired ? uint8(TapOrder.OrderStatus.LOST) : uint8(TapOrder.OrderStatus.OPEN)
        );
    }
}
