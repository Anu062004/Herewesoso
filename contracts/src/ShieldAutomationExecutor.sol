// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IShieldAutomationAdapter, IShieldAutomationChecker} from "./IShieldAutomation.sol";

/// @title ShieldAutomationExecutor
/// @notice Stores immutable, user-owned rescue rules and lets any keeper execute an eligible rule.
/// @dev The contract never custodies user funds. Allowlisted adapters must use protocol-native delegation.
contract ShieldAutomationExecutor {
    struct Rule {
        address owner;
        address adapter;
        address checker;
        uint64 validAfter;
        uint64 validUntil;
        uint64 minInterval;
        uint64 lastExecutedAt;
        uint32 maxExecutions;
        uint32 executionCount;
        uint128 maxGasPrice;
        bytes32 executionDataHash;
        bytes32 checkDataHash;
        bool active;
    }

    error NotGovernor();
    error NotRuleOwner();
    error InvalidAddress();
    error InvalidWindow();
    error InvalidExecutionLimit();
    error AdapterNotAllowed();
    error RuleNotActive();
    error RuleNotReady();
    error RuleExpired();
    error ExecutionLimitReached();
    error GasPriceTooHigh();
    error DataHashMismatch();
    error TriggerNotMet(bytes32 reason);
    error Reentrancy();

    event GovernorTransferStarted(address indexed currentGovernor, address indexed pendingGovernor);
    event GovernorTransferred(address indexed previousGovernor, address indexed newGovernor);
    event AdapterApprovalChanged(address indexed adapter, bool allowed);
    event RuleCreated(
        uint256 indexed ruleId,
        address indexed owner,
        address indexed adapter,
        address checker,
        bytes32 executionDataHash,
        bytes32 checkDataHash
    );
    event RuleCancelled(uint256 indexed ruleId, address indexed owner);
    event RuleExecuted(uint256 indexed ruleId, address indexed keeper, uint32 executionCount, bytes32 receipt);

    address public governor;
    address public pendingGovernor;
    uint256 public nextRuleId = 1;
    mapping(address => bool) public approvedAdapters;
    mapping(uint256 => Rule) private _rules;
    uint256 private _locked = 1;

    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address initialGovernor) {
        if (initialGovernor == address(0)) revert InvalidAddress();
        governor = initialGovernor;
        emit GovernorTransferred(address(0), initialGovernor);
    }

    function startGovernorTransfer(address nextGovernor) external onlyGovernor {
        if (nextGovernor == address(0)) revert InvalidAddress();
        pendingGovernor = nextGovernor;
        emit GovernorTransferStarted(governor, nextGovernor);
    }

    function acceptGovernor() external {
        if (msg.sender != pendingGovernor) revert NotGovernor();
        address previous = governor;
        governor = msg.sender;
        pendingGovernor = address(0);
        emit GovernorTransferred(previous, msg.sender);
    }

    function setAdapterApproval(address adapter, bool allowed) external onlyGovernor {
        if (adapter == address(0) || adapter.code.length == 0) revert InvalidAddress();
        approvedAdapters[adapter] = allowed;
        emit AdapterApprovalChanged(adapter, allowed);
    }

    function createRule(
        address adapter,
        address checker,
        uint64 validAfter,
        uint64 validUntil,
        uint64 minInterval,
        uint32 maxExecutions,
        uint128 maxGasPrice,
        bytes calldata executionData,
        bytes calldata checkData
    ) external returns (uint256 ruleId) {
        if (!approvedAdapters[adapter]) revert AdapterNotAllowed();
        if (checker == address(0) || checker.code.length == 0) revert InvalidAddress();
        if (validUntil != 0 && (validUntil <= validAfter || validUntil <= block.timestamp)) revert InvalidWindow();
        if (maxExecutions == 0) revert InvalidExecutionLimit();

        ruleId = nextRuleId++;
        bytes32 executionHash = keccak256(executionData);
        bytes32 checkHash = keccak256(checkData);
        _rules[ruleId] = Rule({
            owner: msg.sender,
            adapter: adapter,
            checker: checker,
            validAfter: validAfter,
            validUntil: validUntil,
            minInterval: minInterval,
            lastExecutedAt: 0,
            maxExecutions: maxExecutions,
            executionCount: 0,
            maxGasPrice: maxGasPrice,
            executionDataHash: executionHash,
            checkDataHash: checkHash,
            active: true
        });
        emit RuleCreated(ruleId, msg.sender, adapter, checker, executionHash, checkHash);
    }

    function cancelRule(uint256 ruleId) external {
        Rule storage rule = _rules[ruleId];
        if (rule.owner != msg.sender) revert NotRuleOwner();
        if (!rule.active) revert RuleNotActive();
        rule.active = false;
        emit RuleCancelled(ruleId, msg.sender);
    }

    function canExecute(uint256 ruleId, bytes calldata executionData, bytes calldata checkData)
        external
        view
        returns (bool eligible, bytes32 reason)
    {
        Rule storage rule = _rules[ruleId];
        reason = _staticFailure(rule, executionData, checkData);
        if (reason != bytes32(0)) return (false, reason);
        return IShieldAutomationChecker(rule.checker).canExecute(rule.owner, checkData);
    }

    function executeRule(uint256 ruleId, bytes calldata executionData, bytes calldata checkData)
        external
        nonReentrant
        returns (bytes32 receipt)
    {
        Rule storage rule = _rules[ruleId];
        if (!rule.active) revert RuleNotActive();
        if (!approvedAdapters[rule.adapter]) revert AdapterNotAllowed();
        if (block.timestamp < rule.validAfter) revert RuleNotReady();
        if (rule.validUntil != 0 && block.timestamp > rule.validUntil) revert RuleExpired();
        if (rule.executionCount >= rule.maxExecutions) revert ExecutionLimitReached();
        if (rule.lastExecutedAt != 0 && block.timestamp < rule.lastExecutedAt + rule.minInterval) revert RuleNotReady();
        if (rule.maxGasPrice != 0 && tx.gasprice > rule.maxGasPrice) revert GasPriceTooHigh();
        if (keccak256(executionData) != rule.executionDataHash || keccak256(checkData) != rule.checkDataHash) {
            revert DataHashMismatch();
        }

        (bool eligible, bytes32 reason) = IShieldAutomationChecker(rule.checker).canExecute(rule.owner, checkData);
        if (!eligible) revert TriggerNotMet(reason);

        rule.lastExecutedAt = uint64(block.timestamp);
        unchecked { rule.executionCount += 1; }
        if (rule.executionCount == rule.maxExecutions) rule.active = false;

        receipt = IShieldAutomationAdapter(rule.adapter).execute(rule.owner, executionData);
        emit RuleExecuted(ruleId, msg.sender, rule.executionCount, receipt);
    }

    function getRule(uint256 ruleId) external view returns (Rule memory) {
        return _rules[ruleId];
    }

    function _staticFailure(Rule storage rule, bytes calldata executionData, bytes calldata checkData)
        private
        view
        returns (bytes32)
    {
        if (!rule.active) return bytes32("INACTIVE");
        if (!approvedAdapters[rule.adapter]) return bytes32("ADAPTER_DISABLED");
        if (block.timestamp < rule.validAfter) return bytes32("NOT_READY");
        if (rule.validUntil != 0 && block.timestamp > rule.validUntil) return bytes32("EXPIRED");
        if (rule.executionCount >= rule.maxExecutions) return bytes32("EXHAUSTED");
        if (rule.lastExecutedAt != 0 && block.timestamp < rule.lastExecutedAt + rule.minInterval) return bytes32("COOLDOWN");
        if (rule.maxGasPrice != 0 && tx.gasprice > rule.maxGasPrice) return bytes32("GAS_PRICE");
        if (keccak256(executionData) != rule.executionDataHash || keccak256(checkData) != rule.checkDataHash) return bytes32("DATA_HASH");
        return bytes32(0);
    }
}
