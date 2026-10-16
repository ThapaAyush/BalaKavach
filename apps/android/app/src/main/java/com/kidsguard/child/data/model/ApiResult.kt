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
        val isAuthError: Boolean = false
    ) : ApiResult<Nothing>()
}
