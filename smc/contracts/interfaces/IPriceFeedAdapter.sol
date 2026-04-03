// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPriceFeedAdapter
 * @notice Interface for the PriceFeedAdapter Chainlink wrapper.
 */
interface IPriceFeedAdapter {
    function setFeed(string calldata asset, address feed) external;

    function getLatestPrice(string calldata asset) external view returns (int256 price, uint256 updatedAt);

    function getPrice(string calldata asset) external view returns (int256);

    function feeds(string calldata asset) external view returns (address);

    function STALE_THRESHOLD() external view returns (uint256);
}
