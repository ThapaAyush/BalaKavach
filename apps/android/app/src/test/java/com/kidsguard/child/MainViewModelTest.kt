package com.kidsguard.child

import com.kidsguard.child.data.local.ServerConfigStorage
import com.kidsguard.child.data.model.DeviceSession
import com.kidsguard.child.data.model.ReportingPeriodDto
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import com.kidsguard.child.data.repository.DeviceRepository
import com.kidsguard.child.data.repository.PolicyRepository
import com.kidsguard.child.service.usage.UsageStatsReader
import com.kidsguard.child.ui.ConnectionState
import com.kidsguard.child.ui.MainActivity
import com.kidsguard.child.ui.MainViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`

@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModelTest {

    private val testDispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `computeConnectionState maps active pairing attempt to CONNECTING`() {
        val session = DeviceSession.unpaired()
        val state = MainViewModel.computeConnectionState(session, isPairingLoading = true, isSyncLoading = false)
        assertEquals(ConnectionState.CONNECTING, state)
    }

    @Test
    fun `computeConnectionState maps unpaired session to UNPAIRED`() {
        val session = DeviceSession.unpaired()
        val state = MainViewModel.computeConnectionState(session, isPairingLoading = false, isSyncLoading = false)
        assertEquals(ConnectionState.UNPAIRED, state)
    }

    @Test
    fun `computeConnectionState maps invalid session to NEEDS_ATTENTION`() {
        val session = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_INVALID_SESSION,
            deviceId = "dev_123"
        )
        val state = MainViewModel.computeConnectionState(session, isPairingLoading = false, isSyncLoading = false)
        assertEquals(ConnectionState.NEEDS_ATTENTION, state)

        val sessionWithHbInvalid = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            lastHeartbeatStatus = DeviceSession.STATUS_INVALID_SESSION
        )
        val stateHb = MainViewModel.computeConnectionState(sessionWithHbInvalid, isPairingLoading = false, isSyncLoading = false)
        assertEquals(ConnectionState.NEEDS_ATTENTION, stateHb)
    }

    @Test
    fun `computeConnectionState maps active sync to CONNECTING`() {
        val session = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            deviceId = "dev_123"
        )
        val state = MainViewModel.computeConnectionState(session, isPairingLoading = false, isSyncLoading = true)
        assertEquals(ConnectionState.CONNECTING, state)
    }

    @Test
    fun `computeConnectionState maps offline and error status to OFFLINE`() {
        val sessionOffline = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            lastHeartbeatStatus = "offline"
        )
        assertEquals(ConnectionState.OFFLINE, MainViewModel.computeConnectionState(sessionOffline, false, false))

        val sessionError = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            lastHeartbeatStatus = "error"
        )
        assertEquals(ConnectionState.OFFLINE, MainViewModel.computeConnectionState(sessionError, false, false))
    }

    @Test
    fun `computeConnectionState maps active healthy paired session to PAIRED`() {
        val sessionOk = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            lastHeartbeatStatus = "ok",
            deviceId = "dev_123",
            deviceName = "Ayush's Phone"
        )
        assertEquals(ConnectionState.PAIRED, MainViewModel.computeConnectionState(sessionOk, false, false))
    }

    @Test
    fun `zero-fabrication is preserved by ViewModel usage data flow`() {
        val mockRepo = mock(DeviceRepository::class.java)
        val mockPolicyRepo = mock(PolicyRepository::class.java)
        val mockUsageReader = mock(UsageStatsReader::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)

        `when`(mockRepo.deviceSession).thenReturn(MutableStateFlow(DeviceSession.unpaired()))
        `when`(mockPolicyRepo.cachedPolicy).thenReturn(MutableStateFlow(null))
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")

        // 1. Permission denied scenario
        `when`(mockUsageReader.hasPermission()).thenReturn(false)
        `when`(mockUsageReader.measureTodayUsage()).thenReturn(
            ScreenTimeReportRequest(
                date = "2026-10-16",
                totalScreenTimeSeconds = null,
                reportingPeriod = ReportingPeriodDto("2026-10-16T00:00:00Z", "2026-10-16T12:00:00Z"),
                permissionGranted = false,
                source = "unavailable",
                appUsage = emptyList()
            )
        )

        val vm = MainViewModel(mockRepo, mockPolicyRepo, mockUsageReader, mockConfigStorage)

        assertFalse(vm.hasUsagePermission.value)
        assertNotNull(vm.todayUsage.value)
        assertNull(vm.todayUsage.value?.totalScreenTimeSeconds)
        assertEquals("unavailable", vm.todayUsage.value?.source)
        assertTrue(vm.todayUsage.value?.appUsage?.isEmpty() == true)
        assertNotNull(vm.lastUsageRefreshTime.value)
        assertNull(vm.lastSuccessfulMeasurementTime.value)
    }

    @Test
    fun `saveApiUrl enforces validation and rejects invalid URLs`() {
        val mockRepo = mock(DeviceRepository::class.java)
        val mockPolicyRepo = mock(PolicyRepository::class.java)
        val mockUsageReader = mock(UsageStatsReader::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)

        `when`(mockRepo.deviceSession).thenReturn(MutableStateFlow(DeviceSession.unpaired()))
        `when`(mockPolicyRepo.cachedPolicy).thenReturn(MutableStateFlow(null))
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")
        `when`(mockUsageReader.hasPermission()).thenReturn(false)
        `when`(mockUsageReader.measureTodayUsage()).thenReturn(
            ScreenTimeReportRequest(
                date = "2026-10-16",
                totalScreenTimeSeconds = null,
                reportingPeriod = ReportingPeriodDto("2026-10-16T00:00:00Z", "2026-10-16T12:00:00Z"),
                permissionGranted = false,
                source = "unavailable"
            )
        )
        `when`(mockConfigStorage.setApiBaseUrl("http://remote.insecure.com/api/v1"))
            .thenThrow(IllegalArgumentException("Insecure HTTP is not allowed for non-local host."))

        val vm = MainViewModel(mockRepo, mockPolicyRepo, mockUsageReader, mockConfigStorage)

        val success = vm.saveApiUrl("http://remote.insecure.com/api/v1")
        assertFalse(success)
        assertNotNull(vm.apiUrlError.value)
        assertTrue(vm.apiUrlError.value?.contains("Insecure HTTP") == true)
    }

    @Test
    fun `MainViewModel strictly contains no child restriction modification or unpairing methods`() {
        val methods = MainViewModel::class.java.declaredMethods.map { it.name }
        assertFalse("ViewModel must not expose unpairDevice", methods.contains("unpairDevice"))
        assertFalse("ViewModel must not expose addDomain", methods.contains("addDomain"))
        assertFalse("ViewModel must not expose removeDomain", methods.contains("removeDomain"))
        assertFalse("ViewModel must not expose cancelRestrictions", methods.contains("cancelRestrictions"))
    }

    @Test
    fun `release builds exclude developer configuration tab using production resolveTabTitles`() {
        val debugTabs = MainActivity.resolveTabTitles(
            isDebuggable = true,
            tabDevice = "Connection",
            tabScreenTime = "Screen Time",
            tabPermissions = "Permissions & Privacy",
            tabSettings = "Settings"
        )
        assertEquals(4, debugTabs.size)
        assertTrue(debugTabs.contains("Settings"))

        val releaseTabs = MainActivity.resolveTabTitles(
            isDebuggable = false,
            tabDevice = "Connection",
            tabScreenTime = "Screen Time",
            tabPermissions = "Permissions & Privacy",
            tabSettings = "Settings"
        )
        assertEquals(3, releaseTabs.size)
        assertFalse(releaseTabs.contains("Settings"))
    }

    @Test
    fun `unavailable usage is not classified as measured using production isScreenTimeSuccessfullyMeasured`() {
        val nullUsage: ScreenTimeReportRequest? = null
        val deniedUsage = ScreenTimeReportRequest(
            date = "2026-10-16",
            totalScreenTimeSeconds = null,
            reportingPeriod = ReportingPeriodDto("2026-10-16T00:00:00Z", "2026-10-16T12:00:00Z"),
            permissionGranted = false,
            source = "unavailable"
        )
        val validUsage = ScreenTimeReportRequest(
            date = "2026-10-16",
            totalScreenTimeSeconds = 3600L,
            reportingPeriod = ReportingPeriodDto("2026-10-16T00:00:00Z", "2026-10-16T12:00:00Z"),
            permissionGranted = true,
            source = "measured"
        )

        assertFalse(MainActivity.isScreenTimeSuccessfullyMeasured(nullUsage))
        assertFalse(MainActivity.isScreenTimeSuccessfullyMeasured(deniedUsage))
        assertTrue(MainActivity.isScreenTimeSuccessfullyMeasured(validUsage))
    }

    @Test
    fun `formatLastMeasured never presents refresh time as measurement time when usage is unavailable`() {
        val refreshTime = 1776340000000L

        // When not measured, it must return unavailable text regardless of any timestamp passed
        val unavailableResult = MainActivity.formatLastMeasured(
            isMeasured = false,
            lastMeasurementTimeMs = refreshTime,
            unavailableText = "Measurement unavailable — Usage Access required",
            neverText = "Not measured yet",
            measuredFormat = "Last Measured: %1\$s"
        )
        assertEquals("Measurement unavailable — Usage Access required", unavailableResult)
        assertFalse(unavailableResult.contains("Last Measured:"))

        // When measured, it formats the timestamp
        val measuredResult = MainActivity.formatLastMeasured(
            isMeasured = true,
            lastMeasurementTimeMs = refreshTime,
            unavailableText = "Measurement unavailable — Usage Access required",
            neverText = "Not measured yet",
            measuredFormat = "Last Measured: %1\$s"
        )
        assertTrue(measuredResult.startsWith("Last Measured: "))

        // When measured is true but timestamp is null, returns never measured
        val neverResult = MainActivity.formatLastMeasured(
            isMeasured = true,
            lastMeasurementTimeMs = null,
            unavailableText = "Measurement unavailable — Usage Access required",
            neverText = "Not measured yet",
            measuredFormat = "Last Measured: %1\$s"
        )
        assertEquals("Not measured yet", neverResult)
    }

    @Test
    fun `formatReportingPeriod returns unavailable when measurement is not successful`() {
        val refreshTime = 1776340000000L

        val periodUnavailable = MainActivity.formatReportingPeriod(
            isMeasured = false,
            lastMeasurementTimeMs = refreshTime,
            unavailableText = "Reporting Period: Today (Measurement Unavailable)",
            periodFormat = "Today, %1\$s – %2\$s (Local Time)"
        )
        assertEquals("Reporting Period: Today (Measurement Unavailable)", periodUnavailable)

        val periodMeasured = MainActivity.formatReportingPeriod(
            isMeasured = true,
            lastMeasurementTimeMs = refreshTime,
            unavailableText = "Reporting Period: Today (Measurement Unavailable)",
            periodFormat = "Today, %1\$s – %2\$s (Local Time)"
        )
        assertTrue(periodMeasured.startsWith("Today, 12:00 AM – "))
        assertTrue(periodMeasured.endsWith(" (Local Time)"))
    }

    @Test
    fun `MainViewModel keeps refresh time and successful measurement time conceptually distinct`() {
        val mockRepo = mock(DeviceRepository::class.java)
        val mockPolicyRepo = mock(PolicyRepository::class.java)
        val mockUsageReader = mock(UsageStatsReader::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)

        `when`(mockRepo.deviceSession).thenReturn(MutableStateFlow(DeviceSession.unpaired()))
        `when`(mockPolicyRepo.cachedPolicy).thenReturn(MutableStateFlow(null))
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")

        // 1. Initial state: Permission denied
        `when`(mockUsageReader.hasPermission()).thenReturn(false)
        `when`(mockUsageReader.measureTodayUsage()).thenReturn(
            ScreenTimeReportRequest(
                date = "2026-10-16",
                totalScreenTimeSeconds = null,
                reportingPeriod = ReportingPeriodDto("2026-10-16T00:00:00Z", "2026-10-16T12:00:00Z"),
                permissionGranted = false,
                source = "unavailable"
            )
        )

        val vm = MainViewModel(mockRepo, mockPolicyRepo, mockUsageReader, mockConfigStorage)

        // Refresh time was recorded (refresh attempted), but successful measurement time MUST be null
        assertNotNull(vm.lastUsageRefreshTime.value)
        assertNull(vm.lastSuccessfulMeasurementTime.value)

        // 2. Permission granted scenario
        `when`(mockUsageReader.hasPermission()).thenReturn(true)
        `when`(mockUsageReader.measureTodayUsage()).thenReturn(
            ScreenTimeReportRequest(
                date = "2026-10-16",
                totalScreenTimeSeconds = 3600L,
                reportingPeriod = ReportingPeriodDto("2026-10-16T00:00:00Z", "2026-10-16T12:00:00Z"),
                permissionGranted = true,
                source = "measured"
            )
        )

        vm.refreshUsageData()

        // Both refresh time and successful measurement time are non-null
        assertNotNull(vm.lastUsageRefreshTime.value)
        assertNotNull(vm.lastSuccessfulMeasurementTime.value)

        // 3. Permission subsequently lost / measurement becomes unavailable
        `when`(mockUsageReader.hasPermission()).thenReturn(false)
        `when`(mockUsageReader.measureTodayUsage()).thenReturn(
            ScreenTimeReportRequest(
                date = "2026-10-16",
                totalScreenTimeSeconds = null,
                reportingPeriod = ReportingPeriodDto("2026-10-16T00:00:00Z", "2026-10-16T12:00:00Z"),
                permissionGranted = false,
                source = "unavailable"
            )
        )

        vm.refreshUsageData()

        // Refresh time was updated again, but successful measurement time resets to null
        assertNotNull(vm.lastUsageRefreshTime.value)
        assertNull(vm.lastSuccessfulMeasurementTime.value)
    }
}

