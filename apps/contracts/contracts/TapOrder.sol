// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPriceFeedAdapter.sol";
import "./interfaces/IPayoutPool.sol";

/**
 * @title TapOrder
 * @notice Core trading contract. Users stake ETH predicting price will touch
 *         a target level before expiry. Settlement is automatic and trustless.
 */
contract TapOrder is Ownable(msg.sender), Pausable, ReentrancyGuard {
    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    enum OrderStatus {
        OPEN,
        WON,
        LOST
    }

    struct Order {
        address user;
        string  assetKey;       // e.g. "BTC/USD" — used to query price feed
        int256  targetPrice;     // Price at which this order wins
        bool    isAbove;         // true = expecting price to go UP to target
        uint256 stake;          // ETH locked as stake
        uint256 multiplierBps;   // Payout multiplier in basis points (500 = 5x)
        uint256 expiry;          // Unix timestamp when order expires
        OrderStatus status;     // OPEN | WON | LOST
    }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    IPriceFeedAdapter public priceFeedAdapter;
    IPayoutPool       public payoutPool;

    /// @notice Incrementing order counter.
    uint256 public nextOrderId = 1;

    /// @notice All orders, keyed by orderId.
    mapping(uint256 => Order) public orders;

    /// @notice Whitelisted assets (asset key e.g. "BTC/USD" => feed address).
    mapping(string => address) public assetFeeds;

    /// @notice Allowed multiplier values in basis points (200=2x, 500=5x, 1000=10x).
    mapping(uint256 => bool) public allowedMultipliers;

    /// @notice Tracks if an order has already been settled (idempotency guard).
    mapping(uint256 => bool) public settled;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event OrderCreated(
        uint256 indexed orderId,
        address indexed user,
        string  assetKey,
        int256  targetPrice,
        bool    isAbove,
        uint256 stake,
        uint256 multiplierBps,
        uint256 expiry
    );

    event OrderWon(uint256 indexed orderId, address indexed user, uint256 payout);
    event OrderLost(uint256 indexed orderId, address indexed user);

    event AssetAdded(string indexed assetKey, address feed);
    event PausedToggled(bool isPaused);

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error AssetNotWhitelisted(string asset);
    error InvalidMultiplier(uint256 multiplierBps);
    error InsufficientLiquidity(uint256 required, uint256 available);
    error OrderNotOpen(uint256 orderId, uint8 status);
    error AlreadySettled(uint256 orderId);
    error StalePriceFeed(string asset);
    error InvalidDuration(uint256 duration);
    error ZeroStake();

    // Duration constants: 1min, 5min, 15min in seconds
    uint256 public constant DURATION_1M  = 60;
    uint256 public constant DURATION_5M  = 300;
    uint256 public constant DURATION_15M = 900;

    // Stake guards
    uint256 public constant MIN_STAKE = 0.001 ether;
    uint256 public constant MAX_STAKE = 0.1 ether;

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(address _priceFeedAdapter, address _payoutPool) {
        priceFeedAdapter = IPriceFeedAdapter(_priceFeedAdapter);
        payoutPool = IPayoutPool(_payoutPool);

        // Seed allowed multipliers for MVP (200=2x, 500=5x, 1000=10x)
        allowedMultipliers[200]  = true;
        allowedMultipliers[500]  = true;
        allowedMultipliers[1000] = true;
    }

    // -----------------------------------------------------------------------
    // User-facing: create order
    // -----------------------------------------------------------------------

    /**
     * @notice Creates a new tap-trade order.
     *
     * @param assetKey       Asset key (e.g. "BTC/USD") — must be whitelisted
     * @param targetPrice    Price level the user predicts will be touched
     * @param isAbove         true = expects price to rise TO targetPrice;
     *                        false = expects price to fall TO targetPrice
     * @param durationSecs    Order duration in seconds (60, 300, or 900)
     * @param multiplierBps   Payout multiplier in basis points
     */
    function createOrder(
        string calldata assetKey,
        int256  targetPrice,
        bool    isAbove,
        uint256 durationSecs,
        uint256 multiplierBps
    ) external payable whenNotPaused nonReentrant {
        // Validate asset
        address feed = assetFeeds[assetKey];
        if (feed == address(0)) revert AssetNotWhitelisted(assetKey);

        // Validate multiplier
        if (!allowedMultipliers[multiplierBps]) revert InvalidMultiplier(multiplierBps);

        // Validate duration
        if (
            durationSecs != DURATION_1M &&
            durationSecs != DURATION_5M &&
            durationSecs != DURATION_15M
        ) revert InvalidDuration(durationSecs);

        // Validate stake
        if (msg.value == 0) revert ZeroStake();
        if (msg.value < MIN_STAKE || msg.value > MAX_STAKE) revert ZeroStake();

        // Check pool can cover max payout
        uint256 payout = (msg.value * multiplierBps) / 10000;
        uint256 poolBal = payoutPool.getBalance(feed);
        if (poolBal < payout) revert InsufficientLiquidity(payout, poolBal);

        uint256 orderId = nextOrderId++;
        uint256 expiry  = block.timestamp + durationSecs;

        orders[orderId] = Order({
            user:          msg.sender,
            assetKey:      assetKey,
            targetPrice:   targetPrice,
            isAbove:       isAbove,
            stake:         msg.value,
            multiplierBps: multiplierBps,
            expiry:        expiry,
            status:        OrderStatus.OPEN
        });

        emit OrderCreated({
            orderId:       orderId,
            user:          msg.sender,
            assetKey:      assetKey,
            targetPrice:   targetPrice,
            isAbove:       isAbove,
            stake:         msg.value,
            multiplierBps: multiplierBps,
            expiry:        expiry
        });
    }

    // -----------------------------------------------------------------------
    // Settlement (permissionless — anyone can call)
    // -----------------------------------------------------------------------

    /**
     * @notice Settles a single order. Can be called by anyone.
     *         Idempotent — calling twice on a WON/LOST order reverts.
     * @param orderId  Order to settle
     */
    function settleOrder(uint256 orderId) external nonReentrant {
        _settleOrder(orderId);
    }

    /**
     * @notice Settles multiple orders in a single call.
     *         Individual failures do NOT revert the entire batch.
     * @param orderIds Array of order IDs to settle
     */
    function batchSettle(uint256[] calldata orderIds) external {
        uint256 len = orderIds.length;
        for (uint256 i = 0; i < len; ) {
            // call settleOrder externally so try/catch works — settleOrder's own
            // nonReentrant guard + OrderNotOpen check protects against re-entrancy
            try this.settleOrder(orderIds[i]) {
                // success
            } catch {
                // swallow per-order failures so batch continues
            }
            unchecked { ++i; }
        }
    }

    // -----------------------------------------------------------------------
    // Owner controls
    // -----------------------------------------------------------------------

    /**
     * @notice Whitelists a new asset / Chainlink feed.
     */
    function addAsset(string calldata assetKey, address feed) external onlyOwner {
        assetFeeds[assetKey] = feed;
        emit AssetAdded(assetKey, feed);
    }

    /**
     * @notice Pauses the contract — no new orders accepted.
     *         Also pauses the PayoutPool to prevent orphaned settlement state.
     */
    function pause() external onlyOwner {
        _pause();
        payoutPool.pause();
        emit PausedToggled(true);
    }

    /**
     * @notice Unpauses the contract.
     */
    function unpause() external onlyOwner {
        _unpause();
        payoutPool.unpause();
        emit PausedToggled(false);
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    function _settleOrder(uint256 orderId) internal {
        Order storage order = orders[orderId];

        if (order.status != OrderStatus.OPEN) {
            revert OrderNotOpen(orderId, uint8(order.status));
        }
        if (settled[orderId]) revert AlreadySettled(orderId);

        // Mark settled BEFORE external calls (reentrancy guard)
        settled[orderId] = true;

        // Fetch current price from Chainlink via the adapter
        int256 currentPrice;
        try priceFeedAdapter.getLatestPrice(order.assetKey) returns (
            int256 price,
            uint256 /* updatedAt */
        ) {
            currentPrice = price;
        } catch {
            // Stale or reverted — undo flag and propagate
            settled[orderId] = false;
            revert StalePriceFeed(order.assetKey);
        }

        // Check touch — price touching always settles (WIN takes priority over expiry)
        bool touched = _checkTouch(order, currentPrice);

        if (touched) {
            order.status = OrderStatus.WON;
            uint256 payout = (order.stake * order.multiplierBps) / 10000;
            payoutPool.payout(assetFeeds[order.assetKey], order.user, payout);
            emit OrderWon(orderId, order.user, payout);
        } else if (block.timestamp >= order.expiry) {
            // Not touched AND expiry reached → LOST
            order.status = OrderStatus.LOST;
            emit OrderLost(orderId, order.user);
        }
        // else: neither touched nor expired — order stays OPEN
    }

    /**
     * @notice Returns true if currentPrice has touched (or crossed) the target.
     *         Inclusive — exactly equal to target counts as touch.
     */
    function _checkTouch(Order storage order, int256 currentPrice)
        internal
        view
        returns (bool)
    {
        // If expiry reached but price never touched, order is LOST
        // (handled in caller before this)
        if (order.isAbove) {
            return currentPrice >= order.targetPrice;
        } else {
            return currentPrice <= order.targetPrice;
        }
    }
}
