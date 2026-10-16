package com.kidsguard.child.data.model

/**
 * Generic result wrapper for remote API calls.
 */
sealed class ApiResult<out T> {
    data class Success<out T>(val data: T) : ApiResult<T>()
    data class Error(
        val message: String,
        val statusCode: Int? = null,
        val isNetworkError: Boolean = false,
        val isAuthError: Boolean = false,
        val isTimeout: Boolean = false,
        val isServerError: Boolean = false,
        val isRateLimitError: Boolean = false
    ) : ApiResult<Nothing>() {
        /**
         * Returns true if this error represents a temporary failure (502, 503, 504 gateway/server errors,
         * network disconnects, or socket timeouts) that can be retried by background workers.
         */
        val isTemporaryFailure: Boolean
            get() = isNetworkError || isTimeout || statusCode in listOf(502, 503, 504)
    }
}
