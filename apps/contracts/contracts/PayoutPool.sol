// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PayoutPool
 * @notice Holds per-asset liquidity for paying out winning trades.
 *         Only TapOrder (via PAYOUT_ROLE) can trigger payouts.
 */
contract PayoutPool is AccessControl, Pausable {
    bytes32 public constant PAYOUT_ROLE = keccak256("PAYOUT_ROLE");

    /// @notice Per-asset liquidity balance.
    mapping(address => uint256) public balanceOf;

    /// @notice Emitted when funds are deposited.
    event Deposited(address indexed asset, address indexed from, uint256 amount);

    /// @notice Emitted when a payout is made.
    event Payout(address indexed asset, address indexed to, uint256 amount);

    /// @notice Emitted when funds are withdrawn by owner.
    event Withdrawn(address indexed asset, address indexed to, uint256 amount);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Deposits ETH into the pool for a given asset.
     * @param asset  Address of the asset (use address(0) for native ETH)
     */
    function deposit(address asset) external payable whenNotPaused {
        require(msg.value > 0, "ZeroDeposit");
        balanceOf[asset] += msg.value;
        emit Deposited(asset, msg.sender, msg.value);
    }

    /**
     * @notice Withdraws ETH from the pool (owner only).
     * @param asset  Asset address
     * @param amount Amount to withdraw
     * @param to     Recipient address
     */
    function withdraw(address asset, uint256 amount, address to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(balanceOf[asset] >= amount, "InsufficientBalance");
        balanceOf[asset] -= amount;
        (bool success, ) = to.call{value: amount}("");
        require(success, "TransferFailed");
        emit Withdrawn(asset, to, amount);
    }

    /**
     * @notice Transfers payout to a winning user. Called exclusively by TapOrder.
     * @param asset  Asset address
     * @param to     Winner wallet
     * @param amount Payout amount in wei
     */
    function payout(address asset, address to, uint256 amount)
        external
        onlyRole(PAYOUT_ROLE)
        whenNotPaused
    {
        require(balanceOf[asset] >= amount, "InsufficientLiquidity");
        balanceOf[asset] -= amount;

        (bool success, ) = to.call{value: amount}("");
        require(success, "TransferFailed");

        emit Payout(asset, to, amount);
    }

    /**
     * @notice Returns the pool's liquidity for an asset.
     */
    function getBalance(address asset) external view returns (uint256) {
        return balanceOf[asset];
    }

    /**
     * @notice Pauses the pool (owner + emergency).
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses the pool.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
