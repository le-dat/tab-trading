// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockV3Aggregator
 * @notice Mock of Chainlink AggregatorV3Interface for local testing.
 */
contract MockV3Aggregator is AggregatorV3Interface {
    uint8  public constant decimals = 8;
    string public description = "Mock Aggregator";
    uint256 public constant version = 1;

    int256  private _answer;
    uint256 private _updatedAt;
    uint80  private _roundId;

    constructor(int256 initialAnswer) {
        _answer = initialAnswer;
        _updatedAt = block.timestamp;
        _roundId = 1;
    }

    function updateAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        // solhint-disable-next-line not-rely-on-time
        _updatedAt = block.timestamp;
        ++_roundId;
    }

    function updateAnswerAndTimestamp(int256 newAnswer, uint256 newUpdatedAt) external {
        _answer = newAnswer;
        _updatedAt = newUpdatedAt;
        ++_roundId;
    }

    function getRoundData(uint80 roundIdArg)
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, 0, _updatedAt, _roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, 0, _updatedAt, _roundId);
    }
}
