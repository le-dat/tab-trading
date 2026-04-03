// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITapOrder
 * @notice Interface for the TapOrder trading contract.
 */
interface ITapOrder {
    enum OrderStatus {
        OPEN,
        WON,
        LOST
    }

    struct Order {
        address user;
        string  assetKey;
        int256  targetPrice;
        bool    isAbove;
        uint256 stake;
        uint256 multiplierBps;
        uint256 expiry;
        OrderStatus status;
    }

    function createOrder(
        string calldata assetKey,
        int256  targetPrice,
        bool    isAbove,
        uint256 durationSecs,
        uint256 multiplierBps
    ) external payable;

    function settleOrder(uint256 orderId) external;

    function batchSettle(uint256[] calldata orderIds) external;

    function orders(uint256 orderId) external view returns (Order memory);

    function nextOrderId() external view returns (uint256);

    function addAsset(string calldata assetKey, address feed) external;

    function pause() external;

    function unpause() external;
}
