package com.kidsguard.child.data.repository

import com.kidsguard.child.data.local.LocalPolicyStorage
import com.kidsguard.child.data.model.ApiResult
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.remote.KidsGuardApiClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Repository managing parent-configured policy on the child device.
 * Read-only from the child interface; policies are received exclusively from the parent backend.
 */
class PolicyRepository(
    private val localPolicyStorage: LocalPolicyStorage,
    private val apiClient: KidsGuardApiClient
) {
    private val _cachedPolicy = MutableStateFlow(localPolicyStorage.getCachedPolicy())
    val cachedPolicy: StateFlow<DevicePolicyResponse?> = _cachedPolicy.asStateFlow()

    /**
     * Tracks whether the latest policy version acknowledgment succeeded.
     * Prevents treating a policy fetch as an acknowledgment success if the ack request failed.
     */
    var lastAckSucceeded: Boolean = false
        private set

    fun getPolicy(): DevicePolicyResponse? {
        return _cachedPolicy.value
    }

    /**
     * Synchronizes current policy from the server and sends version acknowledgment.
     */
    suspend fun syncPolicy(
        baseUrl: String,
        deviceCredential: String
    ): ApiResult<DevicePolicyResponse> {
        val fetchResult = apiClient.fetchPolicy(baseUrl, deviceCredential)
        return when (fetchResult) {
            is ApiResult.Success -> {
                val policy = fetchResult.data
                val cached = _cachedPolicy.value
                val needsAck = !lastAckSucceeded || cached == null || policy.policyVersion != cached.policyVersion

                localPolicyStorage.savePolicy(policy)
                _cachedPolicy.value = policy

                if (needsAck) {
                    // Automatically acknowledge policy version
                    val ackResult = apiClient.acknowledgePolicy(baseUrl, deviceCredential, policy.policyVersion)
                    lastAckSucceeded = (ackResult is ApiResult.Success)

                    if (ackResult is ApiResult.Error && ackResult.isAuthError) {
                        return ApiResult.Error(
                            message = ackResult.message,
                            statusCode = ackResult.statusCode,
                            isNetworkError = ackResult.isNetworkError,
                            isAuthError = true,
                            isTimeout = ackResult.isTimeout,
                            isServerError = ackResult.isServerError,
                            isRateLimitError = ackResult.isRateLimitError
                        )
                    }
                } else {
                    lastAckSucceeded = true
                }

                ApiResult.Success(policy)
            }
            is ApiResult.Error -> {
                lastAckSucceeded = false
                ApiResult.Error(
                    message = fetchResult.message,
                    statusCode = fetchResult.statusCode,
                    isNetworkError = fetchResult.isNetworkError,
                    isAuthError = fetchResult.isAuthError,
                    isTimeout = fetchResult.isTimeout,
                    isServerError = fetchResult.isServerError,
                    isRateLimitError = fetchResult.isRateLimitError
                )
            }
        }
    }

    fun clearPolicy() {
        localPolicyStorage.clearPolicy()
        _cachedPolicy.value = null
    }
}
