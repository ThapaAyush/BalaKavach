package com.kidsguard.child.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.kidsguard.child.R
import com.kidsguard.child.databinding.ActivityAppBlockedBinding

class AppBlockedActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_APP_NAME = "extra_app_name"
        const val EXTRA_PACKAGE_NAME = "extra_package_name"
    }

    private lateinit var binding: ActivityAppBlockedBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAppBlockedBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val appName = intent.getStringExtra(EXTRA_APP_NAME)?.takeIf { it.isNotBlank() } ?: "This application"
        binding.textBlockedSubtitle.text = getString(R.string.app_blocked_subtitle, appName)

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
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        startActivity(homeIntent)
        finish()
    }
}
