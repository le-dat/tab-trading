// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceFeedAdapter} from "./interfaces/IPriceFeedAdapter.sol";

/**
 * @title PriceFeedAdapter
 * @notice Wraps Chainlink AggregatorV3Interface with stale-check protection.
 *         All price queries revert if the feed hasn't been updated within STALE_THRESHOLD
 *         or if the price is non-positive.
 */
contract PriceFeedAdapter is IPriceFeedAdapter, Ownable(msg.sender) {
    /// @notice Maximum age of a price update before it's considered stale (60 seconds).
    uint256 public constant STALE_THRESHOLD = 60 seconds;

    /// @notice Maps an asset identifier (e.g. address or symbol) to its Chainlink aggregator.
    mapping(string => AggregatorV3Interface) private _feeds;

    /// @notice Emitted when a feed is set for an asset.
    event FeedSet(string indexed asset, address aggregator);

    error StalePriceFeed(string asset, uint256 updatedAt, uint256 now);
    error InvalidPrice(string asset, int256 price);

    /**
     * @notice Sets the Chainlink aggregator address for a given asset.
     * @param asset  Human-readable asset key, e.g. "BTC/USD"
     * @param feed   AggregatorV3Interface contract address
     */
    function setFeed(string calldata asset, address feed) external override onlyOwner {
        _feeds[asset] = AggregatorV3Interface(feed);
        emit FeedSet(asset, feed);
    }

    /**
     * @notice Returns the latest price and update timestamp for an asset.
     * @param asset  Asset key registered via setFeed
     * @return price      Latest price (8 decimals)
     * @return updatedAt  Block timestamp when the price was last updated
     */
    function getLatestPrice(string calldata asset)
        external
        view
        returns (int256 price, uint256 updatedAt)
    {
        AggregatorV3Interface feed = _feeds[asset];
        require(address(feed) != address(0), "FeedNotSet");

        (, int256 answer, , uint256 updatedAtRaw, ) = feed.latestRoundData();

        if (answer <= 0) revert InvalidPrice(asset, answer);

        // solhint-disable-next-line not-rely-on-time
        uint256 age = block.timestamp - updatedAtRaw;
        if (age > STALE_THRESHOLD) revert StalePriceFeed(asset, updatedAtRaw, block.timestamp);

        return (answer, updatedAtRaw);
    }

    /**
     * @notice Convenience: returns only the latest price.
     */
    function getPrice(string calldata asset) external view override returns (int256) {
        (int256 price, ) = this.getLatestPrice(asset);
        return price;
    }

    /**
     * @notice Implementation of IPriceFeedAdapter.feeds
     */
    function feeds(string calldata asset) external view override returns (address) {
        return address(_feeds[asset]);
    }
}
