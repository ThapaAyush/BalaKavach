package com.kidsguard.child.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.kidsguard.child.KidsGuardApp
import com.kidsguard.child.R
import com.kidsguard.child.data.local.FilePolicyStorage
import com.kidsguard.child.databinding.ActivityScreenTimeOverBinding
import com.kidsguard.child.domain.rules.ScreenTimeLimitManager

/**
 * High-visibility reminder screen displayed when daily screen time has expired.
 * Provides two actions:
 * 1. "5 min more" — Grants a temporary 5-minute extension, then re-prompts after 5 minutes.
 * 2. "OK" — Closes applications, redirects to the Android home screen, and locks out access.
 */
class ScreenTimeOverActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_BUDGET_MINUTES = "extra_budget_minutes"
        const val EXTRA_USED_MINUTES = "extra_used_minutes"
        const val EXTRA_IS_LOCKED_MODE = "extra_is_locked_mode"
    }

    private lateinit var binding: ActivityScreenTimeOverBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityScreenTimeOverBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val policy = (applicationContext as? KidsGuardApp)?.localPolicyStorage?.getCachedPolicy()
            ?: FilePolicyStorage(applicationContext).getCachedPolicy()

        val budgetMinutes = intent.getIntExtra(
            EXTRA_BUDGET_MINUTES,
            policy?.dailyLimitMinutes ?: 0
        )
        val usedMinutes = intent.getIntExtra(EXTRA_USED_MINUTES, budgetMinutes)
        val isLockedMode = intent.getBooleanExtra(
            EXTRA_IS_LOCKED_MODE,
            ScreenTimeLimitManager.isLockedForToday(this)
        )

        // Configure informative budget/usage badge
        if (budgetMinutes > 0) {
            binding.textLimitInfoPill.visibility = View.VISIBLE
            binding.textLimitInfoPill.text = getString(
                R.string.time_over_budget_info,
                budgetMinutes,
                usedMinutes
            )
        } else {
            binding.textLimitInfoPill.visibility = View.GONE
        }

        if (isLockedMode) {
            // In locked mode, the user previously clicked OK; app opening attempts are strictly blocked
            binding.textTimeOverTitle.text = getString(R.string.time_over_locked_title)
            binding.textTimeOverSubtitle.text = getString(R.string.time_over_locked_subtitle)
            binding.textTimeOverBody.text = getString(R.string.time_over_locked_body)
            binding.btnExtend5Min.visibility = View.GONE
            binding.btnLockOk.text = getString(R.string.btn_return_home)
        } else {
            binding.textTimeOverTitle.text = getString(R.string.time_over_title)
            binding.textTimeOverSubtitle.text = getString(R.string.time_over_subtitle)
            binding.textTimeOverBody.text = getString(R.string.time_over_body)
            binding.btnExtend5Min.visibility = View.VISIBLE
            binding.btnExtend5Min.text = getString(R.string.btn_extend_5min)
            binding.btnLockOk.text = getString(R.string.btn_time_over_ok)
        }

        // Action 1: "5 min more"
        binding.btnExtend5Min.setOnClickListener {
            ScreenTimeLimitManager.grantExtension(this, 5)
            Toast.makeText(
                this,
                getString(R.string.toast_extended_5min),
                Toast.LENGTH_LONG
            ).show()
            finish()
        }

        // Action 2: "OK"
        binding.btnLockOk.setOnClickListener {
            ScreenTimeLimitManager.lockDeviceForToday(this)
            Toast.makeText(
                this,
                getString(R.string.toast_locked_ok),
                Toast.LENGTH_SHORT
            ).show()
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
