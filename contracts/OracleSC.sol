// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.7;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title The Oracle Mock Oracle contract
 * @notice Oracle smart contract developers can use this to test their contracts
 */
contract OracleSC is Ownable {
    uint256 public constant EXPIRY_TIME = 5 minutes;
    uint256 public callPrice = 0.01 ether;

    struct Request {
        address requester;
        address callbackAddr;
        bytes4 callbackFunctionId;
    }

    struct Result {
        bool success;
        address requester;
        address callbackAddr;
        bytes4 callbackFunctionId;
        bytes32 data;
    }

    mapping(bytes32 => Request) private commitments;
    mapping(bytes32 => Result) public results;

    event OracleRequest(
        address requester,
        bytes32 requestId,
        address callbackAddr,
        bytes4 callbackFunctionId,
        uint256 cancelExpiration,
        bytes data
    );

    event Callbacked(bool success, bytes32 requestId, address callbackAddr, bytes4 callbackFunctionId, bytes32 data);

    event CancelOracleRequest(bytes32 indexed requestId);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Creates the Oracle request
     * @dev Stores the hash of the params as the on-chain commitment for request.
     * Emits OracleRequest event for the Gateway Service to delete.
     * @param _callbackAddress The callback address for the response
     * @param _callbackFunctionId The callback function ID for the response
     * @param _nonce The nonce sent by the requester
     * @param _data The payload of the API request
     */
    function compute(address _callbackAddress, bytes4 _callbackFunctionId, uint256 _nonce, bytes calldata _data)
        external
        payable
        checkCallbackAddress(_callbackAddress)
    {
        require(msg.value >= callPrice, "call price not matched");
        bytes32 requestId = keccak256(abi.encodePacked(msg.sender, _nonce));
        require(commitments[requestId].callbackAddr == address(0), "Must use a uniqID");
        // solhint-disable-next-line not-rely-on-time
        uint256 expiration = (block.timestamp + EXPIRY_TIME);
        commitments[requestId] = Request(msg.sender, _callbackAddress, _callbackFunctionId);
        emit OracleRequest(msg.sender, requestId, _callbackAddress, _callbackFunctionId, expiration, _data);
        payable(msg.sender).transfer(msg.value - callPrice);
    }

    /**
     * @notice Called by the Gateway Service to write result back
     * @dev Given params must hash back to commitment stored from `oracleRequest`.
     * @param _requestId The request ID that must exists
     * @param _data The data to return to the consuming contract
     * @return Status if the external call was successful
     */
    function callback(bytes32 _requestId, bytes32 _data) external isValidRequest(_requestId) onlyOwner returns (bool) {
        Request memory req = commitments[_requestId];
        delete commitments[_requestId];
        (bool success,) = req.callbackAddr.call(abi.encodeWithSelector(req.callbackFunctionId, _requestId, _data)); // solhint-disable-line avoid-low-level-calls
        emit Callbacked(success, _requestId, req.callbackAddr, req.callbackFunctionId, _data);
        results[_requestId] = Result(success, req.requester, req.callbackAddr, req.callbackFunctionId, _data);
        return success;
    }

    /**
     * @notice Allows requesters to cancel requests sent to this oracle contract. Will transfer the callPrice back
     * @dev Give params must hash to a commitment stored on the contract in order for the request to be valid
     * Emits CancelOracleRequest event.
     * @param _requestId The request ID
     */
    function cancelCompute(bytes32 _requestId) external isValidRequest(_requestId) {
        require(commitments[_requestId].requester == msg.sender, "Only original sender can cancel.");
        payable(commitments[_requestId].requester).transfer(callPrice);
        delete commitments[_requestId];
        emit CancelOracleRequest(_requestId);
    }

    function setCallPrice(uint256 price) public onlyOwner {
        callPrice = price;
    }

    function deleteResult(bytes32 _requestId) public isValidRequest(_requestId) {
        require(commitments[_requestId].requester == msg.sender, "Only original sender can delete.");
        delete results[_requestId];
    }

    // MODIFIERS

    /**
     * @dev Reverts if request ID does not exist
     * @param _requestId The given request ID to check in stored `commitments`
     */
    modifier isValidRequest(bytes32 _requestId) {
        require(commitments[_requestId].callbackAddr != address(0), "Must have a valid requestId");
        _;
    }

    /**
     * @dev Reverts if the callback address is Oracle itself
     * @param _to The callback address
     */
    modifier checkCallbackAddress(address _to) {
        require(_to != address(this), "Cannot callback to Oracle self");
        _;
    }
}
