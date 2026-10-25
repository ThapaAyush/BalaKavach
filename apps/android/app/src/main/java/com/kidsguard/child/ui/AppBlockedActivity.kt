package com.kidsguard.child.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.kidsguard.child.R
import com.kidsguard.child.databinding.ActivityAppBlockedBinding

class AppBlockedActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_APP_NAME = "extra_app_name"
        const val EXTRA_PACKAGE_NAME = "extra_package_name"
        const val EXTRA_BLOCK_TYPE = "extra_block_type"
        const val EXTRA_TIME_WINDOW = "extra_time_window"

        const val BLOCK_TYPE_APP_RESTRICTION = "app_restriction"
        const val BLOCK_TYPE_QUIET_HOURS = "quiet_hours"
        const val BLOCK_TYPE_ADULT_CONTENT = "adult_content"
    }

    private lateinit var binding: ActivityAppBlockedBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAppBlockedBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val blockType = intent.getStringExtra(EXTRA_BLOCK_TYPE) ?: BLOCK_TYPE_APP_RESTRICTION
        val appName = intent.getStringExtra(EXTRA_APP_NAME)?.takeIf { it.isNotBlank() } ?: "This application"
        val timeWindow = intent.getStringExtra(EXTRA_TIME_WINDOW)?.takeIf { it.isNotBlank() }

        when (blockType) {
            BLOCK_TYPE_QUIET_HOURS -> {
                binding.textBlockedTitle.text = getString(R.string.quiet_hours_active_title)
                binding.textBlockedTitle.setTextColor(ContextCompat.getColor(this, R.color.status_purple))
                binding.textBlockedSubtitle.text = getString(R.string.quiet_hours_blocked_subtitle, appName)
                if (timeWindow != null) {
                    binding.textBlockedBody.text = getString(R.string.quiet_hours_blocked_body_with_window, timeWindow)
                } else {
                    binding.textBlockedBody.text = getString(R.string.quiet_hours_active_body)
                }
                binding.btnReturnHome.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_purple)
            }
            BLOCK_TYPE_ADULT_CONTENT -> {
                binding.textBlockedTitle.text = getString(R.string.adult_blocked_title)
                binding.textBlockedTitle.setTextColor(ContextCompat.getColor(this, R.color.status_red))
                binding.textBlockedSubtitle.text = getString(R.string.adult_blocked_subtitle)
                binding.textBlockedBody.text = getString(R.string.adult_blocked_body)
                binding.btnReturnHome.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_red)
            }
            else -> {
                binding.textBlockedTitle.text = getString(R.string.app_blocked_title)
                binding.textBlockedTitle.setTextColor(ContextCompat.getColor(this, R.color.status_red))
                binding.textBlockedSubtitle.text = getString(R.string.app_blocked_subtitle, appName)
                binding.textBlockedBody.text = getString(R.string.app_blocked_body)
                binding.btnReturnHome.backgroundTintList = ContextCompat.getColorStateList(this, R.color.primary)
            }
        }

        binding.btnReturnHome.setOnClickListener {
            goToHomeScreen()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        goToHomeScreen()
    }

    private fun goToHomeScreen() {
        val homeIntent = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        startActivity(homeIntent)
        finish()
    }
}
