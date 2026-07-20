// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IShieldAutomationAdapter, IShieldAutomationChecker} from "../IShieldAutomation.sol";

contract MockShieldChecker is IShieldAutomationChecker {
    bool public eligible;
    bytes32 public reason;

    function setResult(bool nextEligible, bytes32 nextReason) external {
        eligible = nextEligible;
        reason = nextReason;
    }

    function canExecute(address, bytes calldata) external view returns (bool, bytes32) {
        return (eligible, reason);
    }
}

contract MockShieldAdapter is IShieldAutomationAdapter {
    event MockExecution(address indexed account, bytes data);

    function execute(address account, bytes calldata data) external returns (bytes32) {
        emit MockExecution(account, data);
        return keccak256(abi.encode(account, data, block.number));
    }
}
