// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPayoutPool
 * @notice Interface for the PayoutPool liquidity contract.
 */
interface IPayoutPool {
    function deposit(address asset) external payable;

    function withdraw(address asset, uint256 amount, address to) external;

    function payout(address asset, address to, uint256 amount) external;

    function balanceOf(address asset) external view returns (uint256);

    function getBalance(address asset) external view returns (uint256);

    function pause() external;

    function unpause() external;
}
